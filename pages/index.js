import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  
  // --- STATE ---
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  
  // Input Form
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState(''); 
  
  // Search & Filter
  const [activeTag, setActiveTag] = useState(''); 
  const [searchQuery, setSearchQuery] = useState('');
  
  // UI States
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTags, setEditTags] = useState('');
  const [editNote, setEditNote] = useState('');

  // NEW FEATURES STATE
  const [reviewItem, setReviewItem] = useState(null); // For Serendipity Engine
  const [relatedItems, setRelatedItems] = useState([]); // For Connector Engine
  const [showRelatedFor, setShowRelatedFor] = useState(null); // ID of card showing related links

  // --- 1. INITIALIZATION ---
  useEffect(() => {
    const savedPass = localStorage.getItem('MY_POCKET_PASS');
    if (savedPass) { setPassword(savedPass); handleLogin(null, savedPass); }
  }, []);

  // --- 2. SHARE LISTENER ---
  useEffect(() => {
    if (!router.isReady) return;
    const { text, link } = router.query;
    const sharedUrl = text || link; 
    if (sharedUrl) {
      const urlMatch = sharedUrl.match(/(https?:\/\/[^\s]+)/);
      setUrl(urlMatch ? urlMatch[0] : sharedUrl);
    }
  }, [router.isReady, router.query]);

  // --- 3. CORE API ---
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
    const processedTags = processTags(tags);
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: url, tags: processedTags, note: note, password: password }),
      });
      const json = await res.json();
      if (json.error) setMessage('❌ ' + json.error);
      else { setMessage('Saved!'); setUrl(''); setTags(''); setNote(''); handleLogin(null, password); }
    } catch (err) { setMessage('Failed to save.'); }
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!confirm('Delete?')) return;
    await fetch('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password }) });
    setReviewItem(null); // Close review if deleted
    handleLogin(null, password); 
  }

  async function saveEdit(id) {
    const processedTags = processTags(editTags);
    await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tags: processedTags, note: editNote, password: password }),
    });
    setEditingId(null);
    handleLogin(null, password);
  }

  // --- 4. FEATURE #1: THE CONNECTOR (Logic) ---
  function findConnections(targetItem) {
    if (showRelatedFor === targetItem.id) {
      setShowRelatedFor(null); // Toggle off
      return;
    }

    const stopWords = ['the', 'is', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'of', 'with', 'at', 'from', 'by', 'on'];
    
    // Helper to tokenize text
    const getTokens = (str) => {
      if (!str) return [];
      return str.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w));
    };

    const targetTags = targetItem.tags ? targetItem.tags.toLowerCase().split(',').map(t=>t.trim()) : [];
    const targetTokens = [...getTokens(targetItem.title), ...getTokens(targetItem.note)];

    // Score every other bookmark
    const scored = bookmarks
      .filter(b => b.id !== targetItem.id)
      .map(b => {
        let score = 0;
        
        // Tag Match (+10 per tag)
        const bTags = b.tags ? b.tags.toLowerCase().split(',').map(t=>t.trim()) : [];
        const commonTags = bTags.filter(t => targetTags.includes(t));
        score += (commonTags.length * 10);

        // Word Match (+3 per word)
        const bTokens = [...getTokens(b.title), ...getTokens(b.note)];
        const commonWords = bTokens.filter(w => targetTokens.includes(w));
        score += (commonWords.length * 3);

        return { ...b, score, commonTags, commonWords };
      })
      .filter(b => b.score > 0) // Only keep relevant ones
      .sort((a, b) => b.score - a.score) // Sort by relevance
      .slice(0, 3); // Top 3

    setRelatedItems(scored);
    setShowRelatedFor(targetItem.id);
  }

  // --- 5. FEATURE #2: SERENDIPITY ENGINE (Logic) ---
  function startReview() {
    if (bookmarks.length === 0) return alert("No bookmarks to review!");
    // Simple Random Pick
    const random = bookmarks[Math.floor(Math.random() * bookmarks.length)];
    setReviewItem(random);
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

  // Search Logic
  const allTagsRaw = bookmarks.flatMap(item => item.tags ? item.tags.split(',') : []);
  const uniqueTags = [...new Set(allTagsRaw.map(t => t.trim().toLowerCase()))].sort();
  const filteredBookmarks = bookmarks.filter(item => {
    const matchesTag = !activeTag || (item.tags && item.tags.toLowerCase().includes(activeTag.toLowerCase()));
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || (item.title?.toLowerCase().includes(q)) || (item.url?.toLowerCase().includes(q)) || (item.tags?.includes(q)) || (item.note?.toLowerCase().includes(q));
    return matchesTag && matchesSearch;
  });

  if (!isLoggedIn) return <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}><form onSubmit={e => handleLogin(e, null)} style={{display:'flex', flexDirection:'column', gap:'10px'}}><h1>My Pocket 🔒</h1><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" style={{padding:'10px'}} /><button style={{padding:'10px'}}>Unlock</button></form></div>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif', padding: '20px' }}>
      
      {/* HEADER */}
      <div style={{ marginBottom: '30px', textAlign: 'center' }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
           <h1 style={{cursor:'pointer', margin:0}} onClick={() => {setActiveTag(''); setSearchQuery('');}}>My Pocket 🔓</h1>
           {/* SERENDIPITY BUTTON */}
           <button onClick={startReview} style={{background:'black', color:'white', border:'none', padding:'10px 20px', borderRadius:'30px', cursor:'pointer', fontWeight:'bold'}}>🎲 Rediscover</button>
        </div>
        
        <div style={{ backgroundColor: '#f9f9f9', padding: '20px', borderRadius: '8px', maxWidth: '800px', margin: '0 auto 20px auto', border: '1px solid #eee' }}>
          <form onSubmit={handleSave} style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste link..." required style={{ flex: 2, minWidth: '200px', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }} />
            <div style={{flex: 1, minWidth: '200px', display:'flex', flexDirection:'column', gap:'5px'}}>
               <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags (max 3)" style={{ padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }} />
               <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (Why save this?)" style={{ padding: '8px', borderRadius: '5px', border: '1px solid #ddd', fontSize:'12px' }} />
            </div>
            <button disabled={loading} style={{ padding: '12px 25px', backgroundColor: 'black', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', height:'fit-content', alignSelf:'center' }}>{loading ? '...' : 'Save'}</button>
          </form>
          {uniqueTags.length > 0 && (
            <div style={{marginTop: '15px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center'}}>
              <span style={{fontSize: '12px', color: '#888', alignSelf: 'center'}}>Quick Add:</span>
              {uniqueTags.map(tag => {
                const isSelected = tags.includes(tag);
                return <button key={tag} onClick={() => toggleTag(tag)} type="button" style={{padding: '4px 10px', borderRadius: '15px', border: isSelected ? '1px solid black' : '1px solid #ddd', backgroundColor: isSelected ? 'black' : 'white', color: isSelected ? 'white' : '#555', fontSize: '11px', cursor: 'pointer'}}>{tag}</button>
              })}
            </div>
          )}
          {message && <p style={{ color: message.includes('❌') ? 'red' : 'green', marginTop: '10px' }}>{message}</p>}
        </div>
      </div>

      {/* FILTER BAR */}
      <div style={{ maxWidth:'800px', margin:'0 auto 20px auto' }}>
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="🔍 Search links, tags, or notes..." style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '16px', marginBottom:'15px' }} />
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px', scrollbarWidth:'none' }}>
          <button onClick={() => setActiveTag('')} style={{ padding: '6px 12px', borderRadius: '20px', border: 'none', cursor: 'pointer', backgroundColor: activeTag === '' ? 'black' : '#e0e0e0', color: activeTag === '' ? 'white' : 'black', fontWeight: 'bold', fontSize:'13px' }}>All</button>
          {uniqueTags.map(tag => ( <button key={tag} onClick={() => setActiveTag(tag)} style={{ padding: '6px 12px', borderRadius: '20px', border: 'none', cursor: 'pointer', backgroundColor: activeTag === tag ? 'black' : '#f0f0f0', color: activeTag === tag ? 'white' : 'black', textTransform: 'capitalize', fontSize:'13px' }}>{tag}</button> ))}
        </div>
      </div>

      {/* GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {filteredBookmarks.map((item) => (
          <div key={item.id} style={{ border: '1px solid #eee', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: '180px', backgroundColor: '#f0f0f0', overflow: 'hidden' }}>{item.image ? <img src={item.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ccc' }}>No Image</div>}</div>
            
            <div style={{ padding: '15px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 'auto' }}>
                <h3 style={{ fontSize: '18px', margin: '0 0 8px 0' }}><a href={item.url} target="_blank" style={{ textDecoration: 'none', color: '#333' }}>{item.title || 'Untitled'}</a></h3>
                
                {item.note && editingId !== item.id && <div style={{background:'#fffae6', padding:'8px', borderRadius:'4px', fontSize:'13px', color:'#555', marginBottom:'10px', fontStyle:'italic'}}>📝 {item.note}</div>}

                {editingId === item.id ? (
                  <div style={{marginBottom:'10px'}}>
                    <input value={editTags} onChange={e => setEditTags(e.target.value)} style={{width:'100%', padding:'5px', border:'1px solid black', borderRadius:'4px', marginBottom:'5px'}} placeholder="Tags" />
                    <input value={editNote} onChange={e => setEditNote(e.target.value)} style={{width:'100%', padding:'5px', border:'1px solid black', borderRadius:'4px', marginBottom:'5px'}} placeholder="Note" />
                    <div style={{display:'flex', gap:'5px'}}>
                      <button onClick={() => saveEdit(item.id)} style={{flex:1, background:'green', color:'white', border:'none', padding:'5px', borderRadius:'3px', cursor:'pointer'}}>Save</button>
                      <button onClick={() => setEditingId(null)} style={{flex:1, background:'#ccc', border:'none', padding:'5px', borderRadius:'3px', cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: '10px', display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems:'center' }}>
                    {item.tags && item.tags.split(',').map(t => <span key={t} style={{ backgroundColor: '#f0f0f0', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', color: '#555' }}>#{t.trim()}</span>)}
                    <button onClick={() => startEditing(item)} style={{background:'none', border:'none', cursor:'pointer', fontSize:'14px', color:'#999'}}>✎</button>
                  </div>
                )}
                <p style={{ fontSize: '14px', color: '#666', lineHeight: '1.4', margin: 0 }}>{item.summary ? (item.summary.length > 100 ? item.summary.substring(0, 100) + '...' : item.summary) : ''}</p>
                
                {/* CONNECTOR BUTTON */}
                <button onClick={() => findConnections(item)} style={{background:'none', border:'none', color:'#0070f3', fontSize:'12px', cursor:'pointer', marginTop:'10px', textDecoration:'underline'}}>
                   {showRelatedFor === item.id ? 'Hide Connections' : '⚡️ Find Connections'}
                </button>

                {/* RELATED ITEMS DISPLAY */}
                {showRelatedFor === item.id && (
                  <div style={{marginTop:'10px', padding:'10px', background:'#f0f7ff', borderRadius:'5px'}}>
                    <h4 style={{margin:'0 0 5px 0', fontSize:'12px', color:'#0070f3'}}>Related Links:</h4>
                    {relatedItems.length === 0 ? <div style={{fontSize:'11px'}}>No matches found.</div> : (
                      <div style={{display:'flex', flexDirection:'column', gap:'5px'}}>
                        {relatedItems.map(r => (
                          <a key={r.id} href={r.url} target="_blank" style={{fontSize:'11px', textDecoration:'none', color:'#333', borderBottom:'1px solid #ddd', paddingBottom:'2px'}}>
                            {r.title} <span style={{color:'#888'}}>({r.commonTags.length > 0 ? 'Tag match' : 'Word match'})</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
              <button onClick={() => handleDelete(item.id)} style={{ marginTop: '15px', padding: '8px', background: 'none', border: '1px solid #ff4444', color: '#ff4444', borderRadius: '4px', cursor: 'pointer', width: '100%' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* FEATURE #1: REVIEW MODAL */}
      {reviewItem && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000}}>
          <div style={{background:'white', padding:'30px', borderRadius:'15px', maxWidth:'500px', width:'90%', textAlign:'center'}}>
            <h2 style={{marginTop:0}}>🎲 Rediscover</h2>
            <div style={{height:'150px', background:'#eee', borderRadius:'8px', overflow:'hidden', marginBottom:'20px'}}>
               {reviewItem.image ? <img src={reviewItem.image} style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <div style={{padding:'50px'}}>No Image</div>}
            </div>
            <h3><a href={reviewItem.url} target="_blank" style={{color:'black'}}>{reviewItem.title}</a></h3>
            <p style={{color:'#666', fontSize:'14px'}}>{reviewItem.summary}</p>
            {reviewItem.note && <div style={{background:'#fffae6', padding:'10px', fontStyle:'italic', marginBottom:'20px'}}>"{reviewItem.note}"</div>}
            
            <div style={{display:'flex', gap:'10px', justifyContent:'center', marginTop:'20px'}}>
              <button onClick={() => setReviewItem(null)} style={{padding:'12px 25px', background:'#ddd', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'bold'}}>Keep (Close)</button>
              <button onClick={() => handleDelete(reviewItem.id)} style={{padding:'12px 25px', background:'#ff4444', color:'white', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'bold'}}>Delete</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
