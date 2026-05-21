import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  
  // --- STATE ---
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  
  // Tabs
  const [activeTab, setActiveTab] = useState('inbox');
  
  // Form
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  
  // Search & Filter
  const [activeTag, setActiveTag] = useState(''); 
  const [searchQuery, setSearchQuery] = useState('');
  
  // UI
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTags, setEditTags] = useState('');
  const [editNote, setEditNote] = useState('');

  // Features
  const [reviewItem, setReviewItem] = useState(null);
  const [relatedItems, setRelatedItems] = useState([]);
  const [showRelatedFor, setShowRelatedFor] = useState(null);
  const [lastOpenedId, setLastOpenedId] = useState(null);
  const [showOnlyUntagged, setShowOnlyUntagged] = useState(false);
  const [expandedTriageId, setExpandedTriageId] = useState(null);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillProcessed, setBackfillProcessed] = useState(0);
  const [backfillRemaining, setBackfillRemaining] = useState(null);

  // Leer-feature
  const [learnOpen, setLearnOpen] = useState(false);
  const [learnLoading, setLearnLoading] = useState(false);
  const [learnResult, setLearnResult] = useState(null); // { suggestions, overrides_count, notion_url }
  const [learnError, setLearnError] = useState(null);

  // 1. INITIALIZATION
  useEffect(() => {
    const savedPass = localStorage.getItem('MY_POCKET_PASS');
    if (savedPass) { setPassword(savedPass); handleLogin(null, savedPass); }
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const { text, link } = router.query;
    const sharedUrl = text || link; 
    if (sharedUrl) {
      const urlMatch = sharedUrl.match(/(https?:\/\/[^\s]+)/);
      setUrl(urlMatch ? urlMatch[0] : sharedUrl);
      setActiveTab('inbox');
    }
  }, [router.isReady, router.query]);

  // 2. CORE ACTIONS
  async function handleLogin(e, passOverride) {
    if (e) e.preventDefault();
    const passToUse = passOverride || password;
    try {
      const res = await fetch('/api/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: passToUse }) });
      const json = await res.json();
      if (!json.error) { setBookmarks(json.data || []); setIsLoggedIn(true); localStorage.setItem('MY_POCKET_PASS', passToUse); setMessage(''); }
      else if (!passOverride) alert('❌ ' + json.error);
    } catch (err) { setMessage('Failed to connect.'); }
  }

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('Saving...');
    try {
      const processedTags = processTags(tags);
      const shouldArchive = processedTags.length > 0;
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: url, tags: processedTags, note, password, is_archived: shouldArchive }),
      });
      const json = await res.json();
      if (json.error) setMessage('❌ ' + json.error);
      else { setMessage(shouldArchive ? '✅ Saved & archived' : 'Saved!'); setUrl(''); setTags(''); setNote(''); handleLogin(null, password); }
    } catch (err) { setMessage('Failed to save.'); }
    setLoading(false);
  }

  async function toggleArchive(id, currentStatus) {
    setBookmarks(bookmarks.map(b => b.id === id ? { ...b, is_archived: !currentStatus } : b));
    await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_archived: !currentStatus, password }),
    });
    handleLogin(null, password); 
  }

  async function executeDelete(id) {
    setBookmarks(prev => prev.map(b => b.id === id ? { ...b, deleted_at: new Date().toISOString() } : b));
    await fetch('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password }) });
  }

  async function restoreItem(id) {
    setBookmarks(prev => prev.map(b => b.id === id ? { ...b, deleted_at: null } : b));
    await fetch('/api/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, deleted_at: null, password }) });
  }

  async function overrideVerdict(item, newVerdict) {
    // Bewaar het oorspronkelijke LLM-oordeel — alleen de eerste keer dat een item wordt overruled,
    // anders ben je elke volgende override aan het vergelijken met je eigen vorige correctie.
    const wasAlreadyOverridden = item.triage?.user_set === true;
    const newTriage = {
      ...(item.triage || {}),
      verdict: newVerdict,
      user_set: true,
      overridden_at: new Date().toISOString(),
    };
    if (!wasAlreadyOverridden && item.triage && !item.triage.failed) {
      newTriage.original_verdict = item.triage.verdict;
      newTriage.original_reasoning = item.triage.reasoning || null;
      newTriage.original_priority = item.triage.priority || null;
    }
    setBookmarks(prev => prev.map(b => b.id === item.id ? { ...b, triage: newTriage } : b));
    await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, triage: newTriage, password }),
    });
  }

  const [reanalyzingId, setReanalyzingId] = useState(null);
  async function reAnalyze(id) {
    setReanalyzingId(id);
    try {
      const res = await fetch('/api/retriage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
      });
      const json = await res.json();
      if (json.error) { setMessage('❌ ' + json.error); return; }
      setBookmarks(prev => prev.map(b => b.id === id ? {
        ...b,
        triage: json.triage,
        suggested_tags: json.suggested_tags ?? b.suggested_tags,
      } : b));
    } finally {
      setReanalyzingId(null);
    }
  }

  async function runLearn() {
    setLearnOpen(true);
    setLearnLoading(true);
    setLearnError(null);
    setLearnResult(null);
    try {
      const res = await fetch('/api/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setLearnError(json.error || `HTTP ${res.status}`);
      } else {
        setLearnResult(json);
      }
    } catch (e) {
      setLearnError(e.message);
    } finally {
      setLearnLoading(false);
    }
  }

  async function runBackfill() {
    setBackfillRunning(true);
    setBackfillProcessed(0);
    setBackfillRemaining(null);
    let total = 0;
    let safety = 200;
    while (safety-- > 0) {
      try {
        const res = await fetch('/api/backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        const json = await res.json();
        if (json.error) { setMessage('❌ ' + json.error); break; }
        total += json.processed;
        setBackfillProcessed(total);
        setBackfillRemaining(json.remaining);
        if (json.done || json.processed === 0) break;
      } catch (e) {
        setMessage('❌ Backfill failed: ' + e.message);
        break;
      }
    }
    setBackfillRunning(false);
    setBackfillRemaining(null);
    handleLogin(null, password);
  }

  async function saveEdit(id) {
    const processedTags = processTags(editTags);
    const body = { id, tags: processedTags, note: editNote, password };
    if (processedTags.length > 0) body.is_archived = true;
    await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setEditingId(null);
    handleLogin(null, password);
  }

  function nextRandomItem(currentId = null) {
    const candidates = bookmarks.filter(b => !b.is_archived && !b.deleted_at && b.id !== currentId);
    if (candidates.length === 0) {
      setReviewItem(null);
      return alert("No more inbox items to review!");
    }
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    setReviewItem(next);
  }

  async function cleanupDelete(id) {
    nextRandomItem(id);
    setBookmarks(prev => prev.map(b => b.id === id ? { ...b, deleted_at: new Date().toISOString() } : b));
    await fetch('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password }) });
  }

  // Helpers
  function findConnections(targetItem) {
    if (showRelatedFor === targetItem.id) { setShowRelatedFor(null); return; }
    const stopWords = ['the','is','a','an','and','or','for','to','in','of','with','at','from','by','on','how','what','why'];
    const getTokens = (str) => (!str ? [] : str.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w)));
    const targetTags = targetItem.tags ? targetItem.tags.toLowerCase().split(',').map(t=>t.trim()) : [];
    const targetTagsList = targetItem.tags ? targetItem.tags.split(',').map(t=>t.trim()) : []; // Fixed logic
    const targetTokens = [...getTokens(targetItem.title), ...getTokens(targetItem.note)];
    
    const scored = bookmarks.filter(b => b.id !== targetItem.id).map(b => {
        let score = 0;
        const bTags = b.tags ? b.tags.toLowerCase().split(',').map(t=>t.trim()) : [];
        score += (bTags.filter(t => targetTags.includes(t)).length * 10);
        const bTokens = [...getTokens(b.title), ...getTokens(b.note)];
        score += (bTokens.filter(w => targetTokens.includes(w)).length * 3);
        return { ...b, score };
      }).filter(b => b.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    setRelatedItems(scored);
    setShowRelatedFor(targetItem.id);
  }
  function processTags(str) { return str.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0).slice(0, 3).join(', '); }
  function toggleTag(tag) {
    let curr = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (curr.includes(tag)) curr = curr.filter(t => t !== tag);
    else { if (curr.length >= 3) return alert("Max 3"); curr.push(tag); }
    setTags(curr.join(', '));
  }
  function selectTagSuggestion(suggested) {
    const parts = tags.split(',');
    const partial = parts[parts.length - 1].trim();
    if (partial.length > 0) {
      parts[parts.length - 1] = ' ' + suggested;
      const cleaned = parts.map(t => t.trim()).filter(Boolean).slice(0, 3);
      setTags(cleaned.join(', ') + (cleaned.length < 3 ? ', ' : ''));
    } else {
      toggleTag(suggested);
    }
  }
  function startEditing(item) { setEditingId(item.id); setEditTags(item.tags || ''); setEditNote(item.note || ''); }
  function getHostname(url) { try { return new URL(url).hostname; } catch(e) { return ''; } }
  function isTwitter(url) { return url && (url.includes('x.com') || url.includes('twitter.com')); }

  const TRIAGE_LABELS = { take: 'Bewaren', partial: 'Deels', try: 'Uitproberen', skip: 'Overslaan', prive: 'Privé' };
  const TRIAGE_COLORS = {
    take:    { bg: '#d1fae5', fg: '#065f46', border: '#10b981' },
    partial: { bg: '#fef3c7', fg: '#92400e', border: '#f59e0b' },
    try:     { bg: '#dbeafe', fg: '#1e40af', border: '#0070f3' },
    skip:    { bg: '#f3f4f6', fg: '#6b7280', border: '#9ca3af' },
    prive:   { bg: '#f3e8ff', fg: '#6b21a8', border: '#a855f7' },
  };
  const FOLLOW_LABELS = { follow: 'Volgen', maybe: 'Twijfel', unfollow: 'Ontvolgen' };

  function suggestTagsFor(item) {
    const stopWords = ['the','is','a','an','and','or','for','to','in','of','with','at','from','by','on','how','what','why'];
    const getTokens = (str) => (!str ? [] : str.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w)));
    const targetTokens = [...getTokens(item.title), ...getTokens(item.summary), ...getTokens(item.note)];
    if (targetTokens.length === 0) return [];
    const tagScores = {};
    bookmarks.forEach(b => {
      if (b.id === item.id || !b.tags || b.tags.trim().length === 0) return;
      const bTokens = [...getTokens(b.title), ...getTokens(b.summary), ...getTokens(b.note)];
      const overlap = bTokens.filter(w => targetTokens.includes(w)).length;
      if (overlap === 0) return;
      b.tags.split(',').forEach(t => {
        const tag = t.trim().toLowerCase();
        if (tag) tagScores[tag] = (tagScores[tag] || 0) + overlap;
      });
    });
    return Object.entries(tagScores).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
  }

  async function quickTag(id, tag) {
    setBookmarks(prev => prev.map(b => b.id === id ? { ...b, tags: tag, is_archived: true } : b));
    await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tags: tag, is_archived: true, password }),
    });
  }

  // 4. FILTERING
  const allTagsRaw = bookmarks.flatMap(item => item.tags ? item.tags.split(',') : []);
  const uniqueTags = [...new Set(allTagsRaw.map(t => t.trim().toLowerCase()))].sort();
  const currentTagsList = tags.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  const tagPartial = (tags.split(',').pop() || '').trim().toLowerCase();
  const suggestedTags = tagPartial.length > 0
    ? uniqueTags.filter(t => t.startsWith(tagPartial) && !currentTagsList.slice(0, -1).includes(t))
    : uniqueTags;
  const filteredBookmarks = bookmarks.filter(item => {
    const isArchived = item.is_archived === true;
    const isDeleted = item.deleted_at != null;
    const isPrive = item.triage?.verdict === 'prive';
    const hasTags = item.tags && item.tags.trim().length > 0;
    // Privé-items leven in eigen tab; uit inbox/vault houden zodat werk-zicht schoon blijft.
    if (activeTab === 'prive' && (!isPrive || isDeleted)) return false;
    if ((activeTab === 'inbox' || activeTab === 'archive') && isPrive) return false;
    if (activeTab === 'inbox' && (isArchived || isDeleted)) return false;
    if (activeTab === 'archive' && (!isArchived || isDeleted)) return false;
    if (activeTab === 'deleted' && !isDeleted) return false;
    if (activeTab === 'archive' && showOnlyUntagged && hasTags) return false;
    const matchesTag = !activeTag || (item.tags && item.tags.toLowerCase().includes(activeTag.toLowerCase()));
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || (item.title?.toLowerCase().includes(q)) || (item.url?.toLowerCase().includes(q)) || (item.tags?.includes(q)) || (item.note?.toLowerCase().includes(q));
    return matchesTag && matchesSearch;
  });
  const isStale = (item) => item.created_at && (Date.now() - new Date(item.created_at).getTime()) > 1000 * 60 * 60 * 24 * 183;

  // Live counter per tab — herberekent automatisch zodra `bookmarks` verandert
  const tabCounts = bookmarks.reduce((acc, item) => {
    const isArchived = item.is_archived === true;
    const isDeleted = item.deleted_at != null;
    const isPrive = item.triage?.verdict === 'prive';
    if (isDeleted) acc.deleted++;
    else if (isPrive) acc.prive++;
    else if (isArchived) acc.archive++;
    else acc.inbox++;
    return acc;
  }, { inbox: 0, archive: 0, prive: 0, deleted: 0 });

  if (!isLoggedIn) return <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}><form onSubmit={e => handleLogin(e, null)} style={{display:'flex', flexDirection:'column', gap:'10px'}}><h1>My Pocket 🔒</h1><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" style={{padding:'10px'}} /><button style={{padding:'10px'}}>Unlock</button></form></div>;

  return (
    <div className="container">
      <style jsx global>{`
        .container { max-width: 1000px; margin: 0 auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .card { border: 1px solid #eee; border-radius: 12px; overflow: hidden; background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.03); display: flex; flex-direction: column; }
        .card-image { height: 160px; background-color: #f8f8f8; overflow: hidden; position: relative; }
        @media (max-width: 600px) {
          .container { padding: 10px; }
          .grid { grid-template-columns: 1fr; gap: 12px; }
          .card-image { height: 130px; }
          h3 { font-size: 15px !important; }
        }
      `}</style>

      {/* HEADER */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
        <h2 style={{margin:0, cursor:'pointer', fontSize:'20px'}} onClick={() => {setActiveTag(''); setSearchQuery('');}}>My Pocket</h2>
        <div style={{display:'flex', gap:'8px'}}>
           <button onClick={runLearn} title="Leer van mijn overrides — krijg voorstellen voor Notion-aanvullingen" style={{background:'#f0f0f0', border:'none', width:'36px', height:'36px', borderRadius:'50%', cursor:'pointer', fontSize:'18px', display:'flex', alignItems:'center', justifyContent:'center'}}>🧠</button>
           <button onClick={() => nextRandomItem(null)} title="Cleanup Mode" style={{background:'#f0f0f0', border:'none', width:'36px', height:'36px', borderRadius:'50%', cursor:'pointer', fontSize:'18px', display:'flex', alignItems:'center', justifyContent:'center'}}>🎲</button>
           <div style={{background:'#f0f0f0', borderRadius:'20px', padding:'3px', display:'flex'}}>
              <button onClick={()=>setActiveTab('inbox')} style={{background: activeTab==='inbox' ? 'white' : 'transparent', border:'none', padding:'6px 12px', borderRadius:'16px', cursor:'pointer', fontSize:'13px', fontWeight: activeTab==='inbox'?'bold':'normal', boxShadow: activeTab==='inbox'?'0 1px 3px rgba(0,0,0,0.1)': 'none'}}>Inbox <span style={{opacity:0.5, fontSize:'11px', marginLeft:'2px', fontWeight:'normal'}}>{tabCounts.inbox}</span></button>
              <button onClick={()=>setActiveTab('archive')} style={{background: activeTab==='archive' ? 'white' : 'transparent', border:'none', padding:'6px 12px', borderRadius:'16px', cursor:'pointer', fontSize:'13px', fontWeight: activeTab==='archive'?'bold':'normal', boxShadow: activeTab==='archive'?'0 1px 3px rgba(0,0,0,0.1)': 'none'}}>Vault <span style={{opacity:0.5, fontSize:'11px', marginLeft:'2px', fontWeight:'normal'}}>{tabCounts.archive}</span></button>
              <button onClick={()=>setActiveTab('prive')} style={{background: activeTab==='prive' ? 'white' : 'transparent', border:'none', padding:'6px 12px', borderRadius:'16px', cursor:'pointer', fontSize:'13px', fontWeight: activeTab==='prive'?'bold':'normal', boxShadow: activeTab==='prive'?'0 1px 3px rgba(0,0,0,0.1)': 'none', color: activeTab==='prive' ? '#6b21a8' : '#666'}}>Privé <span style={{opacity:0.5, fontSize:'11px', marginLeft:'2px', fontWeight:'normal'}}>{tabCounts.prive}</span></button>
              <button onClick={()=>setActiveTab('deleted')} style={{background: activeTab==='deleted' ? 'white' : 'transparent', border:'none', padding:'6px 12px', borderRadius:'16px', cursor:'pointer', fontSize:'13px', fontWeight: activeTab==='deleted'?'bold':'normal', boxShadow: activeTab==='deleted'?'0 1px 3px rgba(0,0,0,0.1)': 'none', color: activeTab==='deleted' ? '#d32f2f' : '#666'}}>Deleted <span style={{opacity:0.5, fontSize:'11px', marginLeft:'2px', fontWeight:'normal'}}>{tabCounts.deleted}</span></button>
           </div>
        </div>
      </div>

      {/* BACKFILL BANNER */}
      {(() => {
        const localPending = bookmarks.filter(b => !b.triage && !b.deleted_at).length;
        const displayPending = backfillRunning && backfillRemaining !== null ? backfillRemaining : localPending;
        if (displayPending === 0 && !backfillRunning) return null;
        return (
          <div style={{background:'#fff8e1', border:'1px solid #ffe082', borderRadius:'8px', padding:'10px 12px', marginBottom:'15px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'8px'}}>
            <span style={{fontSize:'13px', color:'#5d4037'}}>
              {backfillRunning
                ? `🤖 Analyzing… ${backfillProcessed} done, ${displayPending} pending`
                : `🤖 ${displayPending} ${displayPending === 1 ? 'item zonder' : 'items zonder'} AI-analyse`}
            </span>
            <button
              onClick={runBackfill}
              disabled={backfillRunning}
              style={{padding:'5px 12px', background: backfillRunning ? '#ccc' : '#5d4037', color:'white', border:'none', borderRadius:'6px', cursor: backfillRunning ? 'wait' : 'pointer', fontSize:'12px', fontWeight:'600'}}>
              {backfillRunning ? 'Running…' : 'Run backfill'}
            </button>
          </div>
        );
      })()}

      {/* INPUT */}
      {(activeTab === 'inbox' || activeTab === 'archive' || activeTab === 'prive') && (
        <div style={{ backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
          <form onSubmit={handleSave} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste link..." required style={{ flex: 2, minWidth: '180px', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize:'15px' }} />
            <div style={{flex: 1, minWidth: '180px', display:'flex', flexDirection:'column', gap:'6px'}}>
               <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags..." style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ddd', fontSize:'13px' }} />
               <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note..." style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ddd', fontSize:'13px' }} />
            </div>
            <button disabled={loading} style={{ padding: '0 20px', backgroundColor: 'black', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight:'bold', fontSize:'13px' }}>{loading ? '...' : 'Save'}</button>
          </form>
          {suggestedTags.length > 0 && (
            <div style={{marginTop: '8px', display: 'flex', gap: '5px', flexWrap: 'wrap'}}>
              {suggestedTags.map(tag => {
                const isSelected = currentTagsList.includes(tag);
                return <button key={tag} onClick={() => selectTagSuggestion(tag)} type="button" style={{padding: '3px 8px', borderRadius: '10px', border: isSelected ? '1px solid black' : '1px solid #ddd', backgroundColor: isSelected ? 'black' : 'white', color: isSelected ? 'white' : '#666', fontSize: '11px', cursor: 'pointer'}}>{tag}</button>
              })}
            </div>
          )}
          {message && <p style={{ color: message.includes('❌') ? 'red' : 'green', margin: '8px 0 0 0', fontSize:'12px' }}>{message}</p>}
        </div>
      )}

      {/* SEARCH & GRID */}
      <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="🔍 Find..." style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #eee', fontSize: '15px', marginBottom: activeTab==='archive' ? '8px' : '15px', background:'#fff' }} />
      {activeTab === 'archive' && (
        <div style={{display:'flex', gap:'6px', marginBottom:'15px'}}>
          <button onClick={() => setShowOnlyUntagged(!showOnlyUntagged)} style={{padding:'4px 10px', borderRadius:'12px', border: showOnlyUntagged ? '1px solid #0070f3' : '1px solid #ddd', background: showOnlyUntagged ? '#0070f3' : 'white', color: showOnlyUntagged ? 'white' : '#666', fontSize:'12px', cursor:'pointer'}}>
            {showOnlyUntagged ? '✓ ' : ''}Only untagged
          </button>
        </div>
      )}
      
      {/* THE GRID (Cards) */}
      <div className="grid">
        {filteredBookmarks.map((item) => (
          <div key={item.id} className="card" style={{
            position: 'relative',
            ...(item.id === lastOpenedId ? {boxShadow:'0 0 0 2px #0070f3', borderColor:'#0070f3'} : {}),
            ...(activeTab === 'archive' && isStale(item) ? {opacity: 0.65} : {})
          }}>
            {/* TRIAGE BADGE — top-left over image */}
            {item.triage && !item.triage.failed && activeTab !== 'deleted' && (() => {
              const v = item.triage.verdict;
              const c = TRIAGE_COLORS[v] || TRIAGE_COLORS.skip;
              const label = TRIAGE_LABELS[v] || v;
              const priority = v === 'try' && item.triage.priority ? ' ' + item.triage.priority : '';
              const expanded = expandedTriageId === item.id;
              return (
                <button
                  onClick={() => setExpandedTriageId(expanded ? null : item.id)}
                  style={{position:'absolute', top:'8px', left:'8px', zIndex:5, display:'inline-flex', alignItems:'center', gap:'4px', padding:'4px 9px', borderRadius:'12px', border:`1.5px solid ${c.border}`, background:'rgba(255,255,255,0.96)', color:c.fg, fontSize:'11px', fontWeight:'700', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.18)', backdropFilter:'blur(2px)'}}>
                  {label}{priority}
                  {item.triage.user_set && <span style={{opacity:0.5, fontSize:'9px', marginLeft:'2px'}}>✎</span>}
                  <span style={{opacity:0.6, fontSize:'9px'}}>{expanded ? '▴' : '▾'}</span>
                </button>
              );
            })()}
            <a href={item.url} target="_blank" onClick={() => setLastOpenedId(item.id)} style={{textDecoration:'none', color:'inherit', display:'block'}}>
              
              {/* CARD VISUALS */}
              <div className="card-image">
                {/* 1. TWITTER / X CARD */}
                {isTwitter(item.url) ? (
                   <div style={{height:'100%', padding:'15px', display:'flex', flexDirection:'column', justifyContent:'center', background:'#f8fbff', borderBottom:'1px solid #e1e8ed'}}>
                      <div style={{fontSize:'11px', color:'#1d9bf0', fontWeight:'bold', marginBottom:'5px'}}>
                         {item.title ? item.title.replace('Tweet by ', '@') : 'Twitter / X'}
                      </div>
                      <div style={{fontSize:'12px', color:'#333', lineHeight:'1.4', overflow:'hidden', display:'-webkit-box', WebkitLineClamp:4, WebkitBoxOrient:'vertical'}}>
                         {item.summary || "Click to open tweet..."}
                      </div>
                   </div>
                ) : 
                /* 2. NORMAL IMAGE CARD */
                item.image ? (
                  <img src={item.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  /* 3. FAVICON FALLBACK */
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection:'column', gap:'5px' }}>
                     <img src={`https://www.google.com/s2/favicons?domain=${getHostname(item.url)}&sz=128`} style={{width:'48px', height:'48px', objectFit:'contain'}} onError={(e) => e.target.style.display='none'} />
                  </div>
                )}
              </div>

              <div style={{ padding: '12px 12px 4px 12px' }}>
                <h3 style={{ fontSize: '16px', margin: '0 0 4px 0', lineHeight:'1.3', fontWeight:'600' }}>
                   {isTwitter(item.url) ? "Tweet" : (item.title || 'Untitled Link')}
                </h3>
                <div style={{color:'#999', fontSize:'11px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', display:'flex', alignItems:'center', gap:'6px'}}>
                  <span style={{overflow:'hidden', textOverflow:'ellipsis'}}>{getHostname(item.url)}</span>
                  {activeTab === 'archive' && isStale(item) && <span style={{background:'#fff3cd', color:'#856404', padding:'1px 5px', borderRadius:'3px', fontSize:'10px', fontWeight:'600', flexShrink:0}}>6m+</span>}
                </div>
              </div>
            </a>

            {/* TRIAGE EXPANDED PANEL */}
            {item.triage && !item.triage.failed && expandedTriageId === item.id && activeTab !== 'deleted' && (() => {
              const v = item.triage.verdict;
              const c = TRIAGE_COLORS[v] || TRIAGE_COLORS.skip;
              return (
                <div style={{margin:'8px 12px 0 12px', padding:'10px', background:c.bg, borderRadius:'6px', fontSize:'12px', color:'#333', lineHeight:'1.4', border:`1px solid ${c.border}`}}>
                  <div>{item.triage.reasoning}</div>
                  {item.triage.action && <div style={{marginTop:'6px'}}><b>Actie:</b> {item.triage.action}</div>}
                  {item.triage.follow_advice && (
                    <div style={{marginTop:'6px'}}><b>Account:</b> {FOLLOW_LABELS[item.triage.follow_advice] || item.triage.follow_advice}</div>
                  )}
                  <div style={{marginTop:'10px', paddingTop:'8px', borderTop:'1px solid rgba(0,0,0,0.1)', display:'flex', gap:'4px', flexWrap:'wrap', alignItems:'center'}}>
                    <span style={{fontSize:'10px', color:'#666', marginRight:'2px'}}>Wijzig:</span>
                    {['take','partial','try','skip','prive'].map(verdictKey => (
                      <button key={verdictKey} onClick={() => overrideVerdict(item, verdictKey)}
                        style={{padding:'2px 7px', borderRadius:'10px', border: v===verdictKey ? `1.5px solid ${TRIAGE_COLORS[verdictKey].border}` : '1px solid #ccc', background: v===verdictKey ? TRIAGE_COLORS[verdictKey].bg : 'white', color: TRIAGE_COLORS[verdictKey].fg, fontSize:'10px', fontWeight: v===verdictKey?'700':'500', cursor:'pointer'}}>
                        {TRIAGE_LABELS[verdictKey]}
                      </button>
                    ))}
                    <button onClick={() => reAnalyze(item.id)} disabled={reanalyzingId === item.id}
                      style={{padding:'2px 7px', borderRadius:'10px', border:'1px solid #999', background:'white', color:'#666', fontSize:'10px', cursor: reanalyzingId === item.id ? 'wait' : 'pointer', marginLeft:'auto'}}>
                      {reanalyzingId === item.id ? '…' : '↻ Re-analyze'}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* CONTENT BODY */}
            <div style={{ padding: '0 12px 12px 12px', flex: 1 }}>
              {item.note && editingId !== item.id && ( <div style={{background:'#fff9db', padding:'6px 8px', borderRadius:'4px', fontSize:'12px', color:'#444', marginTop:'8px', borderLeft:'3px solid #fcc419', lineHeight:'1.4'}}>{item.note}</div> )}
              {editingId === item.id ? (
                <div style={{marginTop:'10px', padding:'10px', background:'#f9f9f9', borderRadius:'8px'}}>
                  <input value={editTags} onChange={e => setEditTags(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(item.id); } }} style={{width:'100%', padding:'6px', marginBottom:'5px', border:'1px solid #ddd', borderRadius:'4px', fontSize:'13px'}} placeholder="Tags" />
                  <input value={editNote} onChange={e => setEditNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(item.id); } }} style={{width:'100%', padding:'6px', marginBottom:'5px', border:'1px solid #ddd', borderRadius:'4px', fontSize:'13px'}} placeholder="Note" />
                  <div style={{display:'flex', gap:'5px'}}>
                    <button onClick={() => saveEdit(item.id)} style={{flex:1, background:'black', color:'white', border:'none', padding:'6px', borderRadius:'4px', cursor:'pointer', fontSize:'12px'}}>Save</button>
                    <button onClick={() => setEditingId(null)} style={{flex:1, background:'#ddd', border:'none', padding:'6px', borderRadius:'4px', cursor:'pointer', fontSize:'12px'}}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {item.tags && item.tags.trim().length > 0 ? (
                    item.tags.split(',').map(t => <span key={t} style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', color: '#666', fontWeight:'500' }}>#{t.trim()}</span>)
                  ) : activeTab === 'inbox' && (() => {
                    const dbSuggestions = item.suggested_tags
                      ? item.suggested_tags.split(',').map(t => t.trim()).filter(Boolean)
                      : null;
                    const suggestions = (dbSuggestions && dbSuggestions.length > 0) ? dbSuggestions : suggestTagsFor(item);
                    if (suggestions.length === 0) return null;
                    return <>
                      <span style={{fontSize:'10px', color:'#999'}}>Suggested:</span>
                      {suggestions.map(t => (
                        <button key={t} onClick={() => quickTag(item.id, t)} style={{padding:'2px 6px', borderRadius:'10px', border:'1px dashed #0070f3', background:'#f0f7ff', color:'#0070f3', fontSize:'10px', cursor:'pointer'}}>+ {t}</button>
                      ))}
                    </>;
                  })()}
                </div>
              )}
            </div>

            {/* ACTION BAR */}
            {item.deleted_at ? (
              <div style={{borderTop:'1px solid #f0f0f0', padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fff5f5', minHeight:'40px'}}>
                <span style={{fontSize:'11px', color:'#999'}}>
                  Removed in {Math.max(0, 7 - Math.floor((Date.now() - new Date(item.deleted_at).getTime()) / 86400000))}d
                </span>
                <button onClick={() => restoreItem(item.id)} title="Restore" style={{background:'none', border:'none', cursor:'pointer', fontSize:'13px', color:'#0070f3', fontWeight:'600', padding:0}}>↩️ Restore</button>
              </div>
            ) : (
              <div style={{borderTop:'1px solid #f0f0f0', padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fafafa', minHeight:'40px'}}>
                <button onClick={() => findConnections(item)} style={{background:'none', border:'none', color: showRelatedFor===item.id ? '#0070f3' : '#999', fontSize:'13px', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px', padding:0}}>🔗 <span style={{fontSize:'11px', fontWeight:'600'}}>Related</span></button>
                <div style={{display:'flex', gap:'12px'}}>
                   <button onClick={() => startEditing(item)} title="Edit" style={{background:'none', border:'none', cursor:'pointer', fontSize:'14px', color:'#999', padding:0}}>✏️</button>
                   <button onClick={() => toggleArchive(item.id, item.is_archived)} title={item.is_archived ? "Unarchive" : "Archive"} style={{background:'none', border:'none', cursor:'pointer', fontSize:'14px', color: item.is_archived ? '#0070f3' : '#999', padding:0}}> {item.is_archived ? '📥' : '✅'} </button>
                   <button onClick={() => executeDelete(item.id)} title="Delete (7-day recovery in DB)" style={{background:'none', border:'none', cursor:'pointer', fontSize:'14px', color:'#ff6b6b', padding:0}}>🗑</button>
                </div>
              </div>
            )}
            {showRelatedFor === item.id && (
              <div style={{background:'#f0f7ff', padding:'8px 12px', borderTop:'1px solid #cfe2ff'}}>
                {relatedItems.length === 0 ? <div style={{fontSize:'11px', color:'#666'}}>No matches found.</div> : (
                  <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
                    {relatedItems.map(r => ( <a key={r.id} href={r.url} target="_blank" style={{fontSize:'11px', textDecoration:'none', color:'#000', display:'block', lineHeight:'1.3'}}> ↳ {r.title} <span style={{color:'#888', fontSize:'10px'}}>({r.score})</span> </a> ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* --- UNIVERSAL CARD CLEANUP MODE (No more blank screens) --- */}
      {reviewItem && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'white', zIndex:2000, display:'flex', flexDirection:'column'}}>
            {/* Top Bar */}
            <div style={{padding:'10px', background:'#f5f5f5', borderBottom:'1px solid #ddd', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{fontWeight:'bold', fontSize:'14px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'80%'}}>{getHostname(reviewItem.url)}</div>
                <button onClick={() => setReviewItem(null)} style={{border:'none', background:'none', fontSize:'18px', cursor:'pointer'}}>✕</button>
            </div>
            
            {/* The "Universal Reader Card" */}
            <div style={{flex:1, background:'#f0f0f0', position:'relative', overflowY:'auto', display:'flex', alignItems:'center', justifyContent:'center'}}>
                <div style={{background:'white', padding:'30px', borderRadius:'16px', boxShadow:'0 5px 20px rgba(0,0,0,0.1)', maxWidth:'500px', width:'90%', maxHeight:'80vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:'15px'}}>
                   
                   {/* Special Header for Twitter */}
                   {isTwitter(reviewItem.url) && <div style={{fontSize:'14px', color:'#1d9bf0', fontWeight:'bold'}}>🐦 Tweet</div>}
                   
                   {/* Main Title */}
                   <h2 style={{margin:0, fontSize:'22px', lineHeight:'1.3', color:'#111'}}>
                      {isTwitter(reviewItem.url) ? (reviewItem.title.replace('Tweet by ', '@')) : (reviewItem.title || 'Untitled Link')}
                   </h2>
                   
                   {/* Image (If exists and not Twitter) */}
                   {!isTwitter(reviewItem.url) && reviewItem.image && (
                      <img src={reviewItem.image} style={{width:'100%', borderRadius:'8px', maxHeight:'200px', objectFit:'cover'}} />
                   )}

                   {/* The Summary / Text */}
                   <div style={{fontSize:'16px', lineHeight:'1.6', color:'#333', whiteSpace:'pre-wrap'}}>
                      {reviewItem.summary ? reviewItem.summary : <span style={{color:'#999', fontStyle:'italic'}}>No summary text available.</span>}
                   </div>
                   
                   {/* My Note */}
                   {reviewItem.note && (
                      <div style={{padding:'12px', background:'#fff9db', borderRadius:'8px', fontSize:'14px', borderLeft:'4px solid #fcc419'}}>
                         <b>My Note:</b> {reviewItem.note}
                      </div>
                   )}
                   
                   {/* Link to actual site */}
                   <a href={reviewItem.url} target="_blank" style={{display:'block', textAlign:'center', padding:'12px', background:'#f5f5f5', borderRadius:'8px', color:'#0070f3', textDecoration:'none', fontWeight:'bold', marginTop:'10px'}}>
                      View Original Website ↗
                   </a>
                </div>
            </div>
            
            {/* Bottom Actions */}
            <div style={{padding:'15px', background:'white', borderTop:'1px solid #ddd', display:'flex', gap:'10px'}}>
               <button onClick={() => nextRandomItem(reviewItem.id)} style={{flex:1, padding:'15px', background:'#222', color:'white', border:'none', borderRadius:'12px', cursor:'pointer', fontWeight:'bold', fontSize:'16px'}}>Keep ➡️</button>
               <button onClick={() => cleanupDelete(reviewItem.id)} style={{flex:1, padding:'15px', background:'#ffebee', color:'#d32f2f', border:'none', borderRadius:'12px', cursor:'pointer', fontWeight:'bold', fontSize:'16px'}}>Delete 🗑</button>
            </div>
        </div>
      )}

      {/* LEER-MODAL */}
      {learnOpen && (
        <div onClick={() => setLearnOpen(false)} style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'}}>
          <div onClick={e => e.stopPropagation()} style={{background:'white', borderRadius:'12px', maxWidth:'720px', width:'100%', maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 10px 40px rgba(0,0,0,0.2)'}}>
            <div style={{padding:'16px 20px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div>
                <h2 style={{margin:0, fontSize:'18px'}}>🧠 Leer van mijn overrides</h2>
                {learnResult && <div style={{fontSize:'12px', color:'#666', marginTop:'4px'}}>{learnResult.overrides_count} override{learnResult.overrides_count === 1 ? '' : 's'} geanalyseerd</div>}
              </div>
              <button onClick={() => setLearnOpen(false)} style={{background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#666'}}>✕</button>
            </div>

            <div style={{padding:'20px', overflowY:'auto', flex:1}}>
              {learnLoading && (
                <div style={{textAlign:'center', padding:'40px 20px', color:'#666'}}>
                  <div style={{fontSize:'24px', marginBottom:'10px'}}>⏳</div>
                  <div>Sonnet analyseert je overrides... (kan 10-20s duren)</div>
                </div>
              )}
              {learnError && (
                <div style={{background:'#fee', border:'1px solid #fcc', borderRadius:'8px', padding:'12px', color:'#c00', fontSize:'13px'}}>
                  <b>Fout:</b> {learnError}
                </div>
              )}
              {learnResult && !learnLoading && (
                <div>
                  <div style={{fontSize:'13px', color:'#555', lineHeight:'1.5', marginBottom:'12px'}}>
                    Voorstellen om in je Notion-prompt te plakken. Lees ze, kies wat je wilt overnemen, plak in <a href={learnResult.notion_url} target="_blank" rel="noopener" style={{color:'#0070f3'}}>de Notion-pagina</a>. Wijzigingen worden binnen 5 min door de app opgepikt.
                  </div>
                  <pre style={{whiteSpace:'pre-wrap', wordBreak:'break-word', background:'#f9f9f9', border:'1px solid #eee', borderRadius:'8px', padding:'14px', fontSize:'13px', lineHeight:'1.5', color:'#222', fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', margin:0}}>{learnResult.suggestions}</pre>
                </div>
              )}
            </div>

            {learnResult && !learnLoading && (
              <div style={{padding:'12px 20px', borderTop:'1px solid #eee', display:'flex', gap:'10px', justifyContent:'flex-end'}}>
                <button
                  onClick={() => { navigator.clipboard.writeText(learnResult.suggestions); setMessage('Suggesties gekopieerd'); setTimeout(() => setMessage(''), 2000); }}
                  style={{padding:'8px 14px', background:'#f0f0f0', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontWeight:600}}
                >📋 Kopieer</button>
                <a href={learnResult.notion_url} target="_blank" rel="noopener" style={{padding:'8px 14px', background:'black', color:'white', borderRadius:'6px', textDecoration:'none', fontSize:'13px', fontWeight:600, display:'inline-block'}}>Open Notion ↗</a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
