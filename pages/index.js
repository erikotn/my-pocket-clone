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
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: url, tags: processedTags, note, password }),
      });
      const json = await res.json();
      if (json.error) setMessage('❌ ' + json.error);
      else { setMessage('Saved!'); setUrl(''); setTags(''); setNote(''); handleLogin(null, password); }
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
    setBookmarks(prev => prev.filter(b => b.id !== id));
    await fetch('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password }) });
  }

  async function saveEdit(id) {
    const processedTags = processTags(editTags);
    await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tags: processedTags, note: editNote, password }),
    });
    setEditingId(null);
    handleLogin(null, password);
  }

  function nextRandomItem(currentId = null) {
    const candidates = bookmarks.filter(b => !b.is_archived && b.id !== currentId);
    if (candidates.length === 0) {
      setReviewItem(null);
      return alert("No more inbox items to review!");
    }
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    setReviewItem(next);
  }

  async function cleanupDelete(id) {
    nextRandomItem(id);
    setBookmarks(prev => prev.filter(b => b.id !== id));
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
  function startEditing(item) { setEditingId(item.id); setEditTags(item.tags || ''); setEditNote(item.note || ''); }
  function getHostname(url) { try { return new URL(url).hostname; } catch(e) { return ''; } }
  function isTwitter(url) { return url && (url.includes('x.com') || url.includes('twitter.com')); }

  // 4. FILTERING
  const allTagsRaw = bookmarks.flatMap(item => item.tags ? item.tags.split(',') : []);
  const uniqueTags = [...new Set(allTagsRaw.map(t => t.trim().toLowerCase()))].sort();
  const filteredBookmarks = bookmarks.filter(item => {
    const isArchived = item.is_archived === true; 
    if (activeTab === 'inbox' && isArchived) return false;
    if (activeTab === 'archive' && !isArchived) return false;
    const matchesTag = !activeTag || (item.tags && item.tags.toLowerCase().includes(activeTag.toLowerCase()));
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || (item.title?.toLowerCase().includes(q)) || (item.url?.toLowerCase().includes(q)) || (item.tags?.includes(q)) || (item.note?.toLowerCase().includes(q));
    return matchesTag && matchesSearch;
  });

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
           <button onClick={() => nextRandomItem(null)} title="Cleanup Mode" style={{background:'#f0f0f0', border:'none', width:'36px', height:'36px', borderRadius:'50%', cursor:'pointer', fontSize:'18px', display:'flex', alignItems:'center', justifyContent:'center'}}>🎲</button>
           <div style={{background:'#f0f0f0', borderRadius:'20px', padding:'3px', display:'flex'}}>
              <button onClick={()=>setActiveTab('inbox')} style={{background: activeTab==='inbox' ? 'white' : 'transparent', border:'none', padding:'6px 12px', borderRadius:'16px', cursor:'pointer', fontSize:'13px', fontWeight: activeTab==='inbox'?'bold':'normal', boxShadow: activeTab==='inbox'?'0 1px 3px rgba(0,0,0,0.1)': 'none'}}>Inbox</button>
              <button onClick={()=>setActiveTab('archive')} style={{background: activeTab==='archive' ? 'white' : 'transparent', border:'none', padding:'6px 12px', borderRadius:'16px', cursor:'pointer', fontSize:'13px', fontWeight: activeTab==='archive'?'bold':'normal', boxShadow: activeTab==='archive'?'0 1px 3px rgba(0,0,0,0.1)': 'none'}}>Archive</button>
           </div>
        </div>
      </div>

      {/* INPUT */}
      {activeTab === 'inbox' && (
        <div style={{ backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
          <form onSubmit={handleSave} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste link..." required style={{ flex: 2, minWidth: '180px', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize:'15px' }} />
            <div style={{flex: 1, minWidth: '180px', display:'flex', flexDirection:'column', gap:'6px'}}>
               <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags..." style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ddd', fontSize:'13px' }} />
               <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note..." style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ddd', fontSize:'13px' }} />
            </div>
            <button disabled={loading} style={{ padding: '0 20px', backgroundColor: 'black', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight:'bold', fontSize:'13px' }}>{loading ? '...' : 'Save'}</button>
          </form>
          {uniqueTags.length > 0 && (
            <div style={{marginTop: '8px', display: 'flex', gap: '5px', flexWrap: 'wrap'}}>
              {uniqueTags.map(tag => {
                const isSelected = tags.includes(tag);
                return <button key={tag} onClick={() => toggleTag(tag)} type="button" style={{padding: '3px 8px', borderRadius: '10px', border: isSelected ? '1px solid black' : '1px solid #ddd', backgroundColor: isSelected ? 'black' : 'white', color: isSelected ? 'white' : '#666', fontSize: '11px', cursor: 'pointer'}}>{tag}</button>
              })}
            </div>
          )}
          {message && <p style={{ color: message.includes('❌') ? 'red' : 'green', margin: '8px 0 0 0', fontSize:'12px' }}>{message}</p>}
        </div>
      )}

      {/* SEARCH & GRID */}
      <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="🔍 Find..." style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #eee', fontSize: '15px', marginBottom:'15px', background:'#fff' }} />
      
      {/* THE GRID (Cards) */}
      <div className="grid">
        {filteredBookmarks.map((item) => (
          <div key={item.id} className="card" style={item.id === lastOpenedId ? {boxShadow:'0 0 0 2px #0070f3', borderColor:'#0070f3'} : undefined}>
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
                <div style={{color:'#999', fontSize:'11px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{getHostname(item.url)}</div>
              </div>
            </a>

            {/* CONTENT BODY */}
            <div style={{ padding: '0 12px 12px 12px', flex: 1 }}>
              {item.note && editingId !== item.id && ( <div style={{background:'#fff9db', padding:'6px 8px', borderRadius:'4px', fontSize:'12px', color:'#444', marginTop:'8px', borderLeft:'3px solid #fcc419', lineHeight:'1.4'}}>{item.note}</div> )}
              {editingId === item.id ? (
                <div style={{marginTop:'10px', padding:'10px', background:'#f9f9f9', borderRadius:'8px'}}>
                  <input value={editTags} onChange={e => setEditTags(e.target.value)} style={{width:'100%', padding:'6px', marginBottom:'5px', border:'1px solid #ddd', borderRadius:'4px', fontSize:'13px'}} placeholder="Tags" />
                  <input value={editNote} onChange={e => setEditNote(e.target.value)} style={{width:'100%', padding:'6px', marginBottom:'5px', border:'1px solid #ddd', borderRadius:'4px', fontSize:'13px'}} placeholder="Note" />
                  <div style={{display:'flex', gap:'5px'}}>
                    <button onClick={() => saveEdit(item.id)} style={{flex:1, background:'black', color:'white', border:'none', padding:'6px', borderRadius:'4px', cursor:'pointer', fontSize:'12px'}}>Save</button>
                    <button onClick={() => setEditingId(null)} style={{flex:1, background:'#ddd', border:'none', padding:'6px', borderRadius:'4px', cursor:'pointer', fontSize:'12px'}}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {item.tags && item.tags.split(',').map(t => <span key={t} style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', color: '#666', fontWeight:'500' }}>#{t.trim()}</span>)}
                </div>
              )}
            </div>

            {/* ACTION BAR */}
            <div style={{borderTop:'1px solid #f0f0f0', padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fafafa', minHeight:'40px'}}>
              <button onClick={() => findConnections(item)} style={{background:'none', border:'none', color: showRelatedFor===item.id ? '#0070f3' : '#999', fontSize:'13px', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px', padding:0}}>🔗 <span style={{fontSize:'11px', fontWeight:'600'}}>Related</span></button>
              <div style={{display:'flex', gap:'12px'}}>
                 <button onClick={() => startEditing(item)} title="Edit" style={{background:'none', border:'none', cursor:'pointer', fontSize:'14px', color:'#999', padding:0}}>✏️</button>
                 <button onClick={() => toggleArchive(item.id, item.is_archived)} title={item.is_archived ? "Unarchive" : "Archive"} style={{background:'none', border:'none', cursor:'pointer', fontSize:'14px', color: item.is_archived ? '#0070f3' : '#999', padding:0}}> {item.is_archived ? '📥' : '✅'} </button>
                 <button onClick={() => executeDelete(item.id)} title="Delete (7-day recovery in DB)" style={{background:'none', border:'none', cursor:'pointer', fontSize:'14px', color:'#ff6b6b', padding:0}}>🗑</button>
              </div>
            </div>
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
    </div>
  );
}
