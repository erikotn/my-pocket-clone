import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  
  // --- STATE ---
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  
  // Tabs: 'inbox' vs 'archive'
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

  // 1. INITIALIZATION
  useEffect(() => {
    const savedPass = localStorage.getItem('MY_POCKET_PASS');
    if (savedPass) { setPassword(savedPass); handleLogin(null, savedPass); }
  }, []);

  // Android Share Listener
  useEffect(() => {
    if (!router.isReady) return;
    const { text, link } = router.query;
    const sharedUrl = text || link; 
    if (sharedUrl) {
      const urlMatch = sharedUrl.match(/(https?:\/\/[^\s]+)/);
      setUrl(urlMatch ? urlMatch[0] : sharedUrl);
      // Auto-switch to inbox if sharing
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

  async function handleDelete(id) {
    if (!confirm('Delete permanently?')) return;
    await fetch('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password }) });
    setReviewItem(null);
    handleLogin(null, password); 
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

  // 3. LOGIC ENGINES
  function findConnections(targetItem) {
    if (showRelatedFor === targetItem.id) { setShowRelatedFor(null); return; }
    const stopWords = ['the','is','a','an','and','or','for','to','in','of','with','at','from','by','on','how','what','why'];
    const getTokens = (str) => (!str ? [] : str.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w)));
    
    const targetTags = targetItem.tags ? targetItem.tags.toLowerCase().split(',').map(t=>t.trim()) : [];
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

  function startReview() {
    if (bookmarks.length === 0) return alert("No bookmarks!");
    setReviewItem(bookmarks[Math.floor(Math.random() * bookmarks.length)]);
  }

  // Helpers
  function processTags(str) { return str.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0).slice(0, 3).join(', '); }
  function toggleTag(tag) {
    let curr = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (curr.includes(tag)) curr = curr.filter(t => t !== tag);
    else { if (curr.length >= 3) return alert("Max 3"); curr.push(tag); }
    setTags(curr.join(', '));
  }
  function startEditing(item) { setEditingId(item.id); setEditTags(item.tags || ''); setEditNote(item.note || ''); }

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
    <div style={{ maxWidth: '1000px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '20px', color:'#111' }}>
      
      {/* HEADER AREA */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
        <h2 style={{margin:0, cursor:'pointer'}} onClick={() => {setActiveTag(''); setSearchQuery('');}}>My Pocket</h2>
        <div style={{display:'flex', gap:'10px'}}>
           <button onClick={startReview} title="Rediscover a random link" style={{background:'#eee', border:'none', width:'40px', height:'40px', borderRadius:'50%', cursor:'pointer', fontSize:'20px'}}>🎲</button>
           <div style={{background:'#eee', borderRadius:'20px', padding:'4px', display:'flex'}}>
              <button onClick={()=>setActiveTab('inbox')} style={{background: activeTab==='inbox' ? 'white' : 'transparent', border:'none', padding:'8px 16px', borderRadius:'16px', cursor:'pointer', fontWeight: activeTab==='inbox'?'bold':'normal', boxShadow: activeTab==='inbox'?'0 2px 5px rgba(0,0,0,0.1)': 'none'}}>Inbox</button>
              <button onClick={()=>setActiveTab('archive')} style={{background: activeTab==='archive' ? 'white' : 'transparent', border:'none', padding:'8px 16px', borderRadius:'16px', cursor:'pointer', fontWeight: activeTab==='archive'?'bold':'normal', boxShadow: activeTab==='archive'?'0 2px 5px rgba(0,0,0,0.1)': 'none'}}>Archive</button>
           </div>
        </div>
      </div>

      {/* INPUT (Only visible in Inbox) */}
      {activeTab === 'inbox' && (
        <div style={{ backgroundColor: '#f9f9f9', padding: '20px', borderRadius: '12px', marginBottom: '30px' }}>
          <form onSubmit={handleSave} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste link to save..." required style={{ flex: 2, minWidth: '200px', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize:'16px' }} />
            <div style={{flex: 1, minWidth: '200px', display:'flex', flexDirection:'column', gap:'8px'}}>
               <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags (design, tech...)" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }} />
               <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (Why?)" style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }} />
            </div>
            <button disabled={loading} style={{ padding: '0 25px', backgroundColor: 'black', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight:'bold' }}>{loading ? '...' : 'Save'}</button>
          </form>
          {uniqueTags.length > 0 && (
            <div style={{marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
              {uniqueTags.map(tag => {
                const isSelected = tags.includes(tag);
                return <button key={tag} onClick={() => toggleTag(tag)} type="button" style={{padding: '4px 10px', borderRadius: '12px', border: isSelected ? '1px solid black' : '1px solid #ddd', backgroundColor: isSelected ? 'black' : 'white', color: isSelected ? 'white' : '#666', fontSize: '11px', cursor: 'pointer'}}>{tag}</button>
              })}
            </div>
          )}
          {message && <p style={{ color: message.includes('❌') ? 'red' : 'green', margin: '10px 0 0 0', fontSize:'12px' }}>{message}</p>}
        </div>
      )}

      {/* SEARCH */}
      <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="🔍 Find..." style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #eee', fontSize: '16px', marginBottom:'15px', background:'#fff' }} />
      
      {/* CARD GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {filteredBookmarks.map((item) => (
          <div key={item.id} style={{ border: '1px solid #eee', borderRadius: '12px', overflow: 'hidden', background:'white', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column' }}>
            
            {/* Image & Title Area */}
            <a href={item.url} target="_blank" style={{textDecoration:'none', color:'inherit', display:'block'}}>
              <div style={{ height: '160px', backgroundColor: '#f4f4f4', overflow: 'hidden', position:'relative' }}>
                {item.image ? <img src={item.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ccc', fontSize:'12px' }}>No Preview</div>}
              </div>
              <div style={{ padding: '15px 15px 5px 15px' }}>
                <h3 style={{ fontSize: '16px', margin: '0 0 6px 0', lineHeight:'1.4' }}>{item.title || 'Untitled Link'}</h3>
                <div style={{color:'#888', fontSize:'11px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{new URL(item.url).hostname.replace('www.','')}</div>
              </div>
            </a>

            {/* Content Body */}
            <div style={{ padding: '0 15px 15px 15px', flex: 1 }}>
              {/* Note */}
              {item.note && editingId !== item.id && (
                <div style={{background:'#fff9db', padding:'8px 10px', borderRadius:'6px', fontSize:'13px', color:'#555', marginTop:'10px', borderLeft:'3px solid #fcc419'}}>
                  {item.note}
                </div>
              )}

              {/* Edit Form */}
              {editingId === item.id ? (
                <div style={{marginTop:'10px', padding:'10px', background:'#f9f9f9', borderRadius:'8px'}}>
                  <input value={editTags} onChange={e => setEditTags(e.target.value)} style={{width:'100%', padding:'6px', marginBottom:'5px', border:'1px solid #ddd', borderRadius:'4px'}} placeholder="Tags" />
                  <input value={editNote} onChange={e => setEditNote(e.target.value)} style={{width:'100%', padding:'6px', marginBottom:'5px', border:'1px solid #ddd', borderRadius:'4px'}} placeholder="Note" />
                  <div style={{display:'flex', gap:'5px'}}>
                    <button onClick={() => saveEdit(item.id)} style={{flex:1, background:'black', color:'white', border:'none', padding:'6px', borderRadius:'4px', cursor:'pointer', fontSize:'12px'}}>Save</button>
                    <button onClick={() => setEditingId(null)} style={{flex:1, background:'#ddd', border:'none', padding:'6px', borderRadius:'4px', cursor:'pointer', fontSize:'12px'}}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '10px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  {item.tags && item.tags.split(',').map(t => <span key={t} style={{ backgroundColor: '#f0f0f0', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: '#666' }}>#{t.trim()}</span>)}
                </div>
              )}
            </div>

            {/* ACTION BAR (Updated to 'Related' + 'Link Icon') */}
            <div style={{borderTop:'1px solid #f0f0f0', padding:'10px 15px', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fafafa'}}>
              {/* Left: Related */}
              <button onClick={() => findConnections(item)} style={{background:'none', border:'none', color: showRelatedFor===item.id ? '#0070f3' : '#888', fontSize:'13px', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px', padding:0}}>
                 🔗 <span style={{fontSize:'11px', fontWeight:'600'}}>Related</span>
              </button>

              {/* Right: Actions */}
              <div style={{display:'flex', gap:'15px'}}>
                 <button onClick={() => startEditing(item)} title="Edit" style={{background:'none', border:'none', cursor:'pointer', fontSize:'14px', color:'#888', padding:0}}>✏️</button>
                 
                 {/* Archive / Unarchive Button */}
                 <button onClick={() => toggleArchive(item.id, item.is_archived)} title={item.is_archived ? "Unarchive" : "Archive"} style={{background:'none', border:'none', cursor:'pointer', fontSize:'14px', color: item.is_archived ? '#0070f3' : '#888', padding:0}}>
                    {item.is_archived ? '📥' : '✅'}
                 </button>
                 
                 <button onClick={() => handleDelete(item.id)} title="Delete" style={{background:'none', border:'none', cursor:'pointer', fontSize:'14px', color:'#ff4444', padding:0}}>🗑</button>
              </div>
            </div>

            {/* Related Drawer */}
            {showRelatedFor === item.id && (
              <div style={{background:'#f0f7ff', padding:'10px 15px', borderTop:'1px solid #cfe2ff'}}>
                {relatedItems.length === 0 ? <div style={{fontSize:'11px', color:'#666'}}>No matches found.</div> : (
                  <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
                    {relatedItems.map(r => (
                      <a key={r.id} href={r.url} target="_blank" style={{fontSize:'12px', textDecoration:'none', color:'#000'}}>
                        ↳ {r.title} <span style={{color:'#888', fontSize:'10px'}}>({r.score})</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* REDISCOVER MODAL */}
      {reviewItem && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000}}>
          <div style={{background:'white', padding:'30px', borderRadius:'16px', maxWidth:'400px', width:'90%', textAlign:'center', position:'relative'}}>
            <button onClick={() => setReviewItem(null)} style={{position:'absolute', top:'10px', right:'10px', border:'none', background:'none', fontSize:'18px', cursor:'pointer'}}>✕</button>
            <div style={{fontSize:'40px', marginBottom:'10px'}}>🎲</div>
            <h3 style={{margin:'0 0 10px 0'}}><a href={reviewItem.url} target="_blank" style={{color:'black'}}>{reviewItem.title}</a></h3>
            {reviewItem.note && <p style={{background:'#fff9db', padding:'10px', fontStyle:'italic', margin:'10px 0', borderRadius:'6px'}}>"{reviewItem.note}"</p>}
            
            <div style={{display:'flex', gap:'10px', justifyContent:'center', marginTop:'20px'}}>
              <button onClick={() => toggleArchive(reviewItem.id, false)} style={{flex:1, padding:'12px', background:'#eee', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold'}}>Keep / Archive</button>
              <button onClick={() => handleDelete(reviewItem.id)} style={{flex:1, padding:'12px', background:'#ffebee', color:'#d32f2f', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold'}}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
