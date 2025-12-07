import { useState, useEffect } from 'react';

export default function Home() {
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  
  // Form States
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  
  // Filter States
  const [activeTag, setActiveTag] = useState(''); 
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // 1. INITIALIZATION & LOGIN
  useEffect(() => {
    const savedPass = localStorage.getItem('MY_POCKET_PASS');
    if (savedPass) {
      setPassword(savedPass);
      handleLogin(null, savedPass);
    }
  }, []);

  async function handleLogin(e, passOverride) {
    if (e) e.preventDefault();
    const passToUse = passOverride || password;
    
    try {
      // We use the secure fetcher
      const res = await fetch('/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passToUse }),
      });
      const json = await res.json();

      if (json.error) {
        if (!passOverride) alert('❌ ' + json.error);
      } else {
        setBookmarks(json.data || []);
        setIsLoggedIn(true);
        localStorage.setItem('MY_POCKET_PASS', passToUse);
        setMessage('');
      }
    } catch (err) {
      setMessage('Failed to connect.');
    }
  }

  // 2. SAVE FUNCTION
  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('Saving...');

    // Process tags: clean up and limit to 3
    const processedTags = tags.split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0)
      .slice(0, 3)
      .join(', ');

    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: url, tags: processedTags, password: password }),
      });
      
      const json = await res.json();
      
      if (json.error) {
        setMessage('❌ ' + json.error);
      } else {
        setMessage('Saved!');
        setUrl('');
        setTags('');
        handleLogin(null, password); // Refresh list
      }
    } catch (err) {
      setMessage('Failed to save.');
    }
    setLoading(false);
  }

  // 3. DELETE FUNCTION
  async function handleDelete(id) {
    if (!confirm('Delete this bookmark?')) return;
    
    await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, password: password }),
    });

    handleLogin(null, password); // Refresh
  }

  // --- NEW FEATURE: TOGGLE EXISTING TAGS ---
  function toggleTag(tagToToggle) {
    // 1. Get current tags as an array
    let currentTags = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
    
    // 2. Check if tag is already there
    if (currentTags.includes(tagToToggle)) {
      // Remove it
      currentTags = currentTags.filter(t => t !== tagToToggle);
    } else {
      // Add it (if under limit)
      if (currentTags.length >= 3) {
        alert("Max 3 tags allowed.");
        return;
      }
      currentTags.push(tagToToggle);
    }
    
    // 3. Update state string
    setTags(currentTags.join(', '));
  }

  // --- DATA PROCESSING ---
  // Get all unique tags from your history to show in the "Cloud"
  const allTagsRaw = bookmarks.flatMap(item => item.tags ? item.tags.split(',') : []);
  const uniqueTags = [...new Set(allTagsRaw.map(t => t.trim().toLowerCase()))].sort();

  // Filter list based on top bar selection
  const filteredBookmarks = bookmarks.filter(item => {
    if (!activeTag) return true;
    return item.tags && item.tags.toLowerCase().includes(activeTag.toLowerCase());
  });

  // --- RENDER ---
  if (!isLoggedIn) {
    return (
      <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}>
        <form onSubmit={e => handleLogin(e, null)} style={{display:'flex', flexDirection:'column', gap:'10px'}}>
          <h1>My Pocket 🔒</h1>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" style={{padding:'10px'}} />
          <button style={{padding:'10px'}}>Unlock</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif', padding: '20px' }}>
      
      {/* HEADER & ADD FORM */}
      <div style={{ marginBottom: '40px', textAlign: 'center' }}>
        <h1 style={{cursor:'pointer'}} onClick={() => setActiveTag('')}>My Pocket 🔓</h1>
        
        <div style={{ backgroundColor: '#f9f9f9', padding: '20px', borderRadius: '8px', maxWidth: '800px', margin: '0 auto 20px auto', border: '1px solid #eee' }}>
          
          <form onSubmit={handleSave} style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <input 
              type="url" 
              value={url} 
              onChange={(e) => setUrl(e.target.value)} 
              placeholder="Paste link..." 
              required 
              style={{ flex: 2, minWidth: '200px', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
            <input 
              type="text" 
              value={tags} 
              onChange={(e) => setTags(e.target.value)} 
              placeholder="Tags (max 3)" 
              style={{ flex: 1, minWidth: '150px', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
            <button disabled={loading} style={{ padding: '12px 25px', backgroundColor: 'black', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
              {loading ? '...' : 'Save'}
            </button>
          </form>

          {/* NEW: CLICKABLE TAG CLOUD FOR INPUT */}
          {uniqueTags.length > 0 && (
            <div style={{marginTop: '15px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center'}}>
              <span style={{fontSize: '12px', color: '#888', alignSelf: 'center'}}>Quick Add:</span>
              {uniqueTags.map(tag => {
                const isSelected = tags.includes(tag);
                return (
                  <button 
                    key={tag} 
                    onClick={() => toggleTag(tag)}
                    type="button"
                    style={{
                      padding: '4px 10px', 
                      borderRadius: '15px', 
                      border: isSelected ? '1px solid black' : '1px solid #ddd', 
                      backgroundColor: isSelected ? 'black' : 'white',
                      color: isSelected ? 'white' : '#555',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          )}
          
          {message && <p style={{ color: message.includes('❌') ? 'red' : 'green', marginTop: '10px' }}>{message}</p>}
        </div>
      </div>

      {/* FILTER BAR (Viewing) */}
      <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '15px', marginBottom: '20px', borderBottom: '1px solid #eee' }}>
        <button onClick={() => setActiveTag('')} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', backgroundColor: activeTag === '' ? 'black' : '#e0e0e0', color: activeTag === '' ? 'white' : 'black', fontWeight: 'bold' }}>All</button>
        {uniqueTags.map(tag => (
           <button key={tag} onClick={() => setActiveTag(tag)} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', backgroundColor: activeTag === tag ? 'black' : '#f0f0f0', color: activeTag === tag ? 'white' : 'black', textTransform: 'capitalize' }}>{tag}</button>
        ))}
      </div>

      {/* GRID LAYOUT */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {filteredBookmarks.map((item) => (
          <div key={item.id} style={{ border: '1px solid #eee', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
            
            {/* Image */}
            <div style={{ height: '180px', backgroundColor: '#f0f0f0', overflow: 'hidden' }}>
              {item.image ? (
                <img src={item.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ccc' }}>No Image</div>
              )}
            </div>

            {/* Content */}
            <div style={{ padding: '15px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 'auto' }}>
                <h3 style={{ fontSize: '18px', margin: '0 0 8px 0' }}>
                  <a href={item.url} target="_blank" style={{ textDecoration: 'none', color: '#333' }}>{item.title || 'Untitled'}</a>
                </h3>
                
                {/* Tags on Card */}
                {item.tags && (
                  <div style={{ marginBottom: '10px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {item.tags.split(',').map(t => (
                      <span key={t} style={{ backgroundColor: '#f0f0f0', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', color: '#555' }}>
                        #{t.trim()}
                      </span>
                    ))}
                  </div>
                )}
                
                <p style={{ fontSize: '14px', color: '#666', lineHeight: '1.4', margin: 0 }}>
                  {item.summary ? (item.summary.length > 100 ? item.summary.substring(0, 100) + '...' : item.summary) : ''}
                </p>
              </div>

              {/* Delete Button */}
              <button 
                onClick={() => handleDelete(item.id)}
                style={{ marginTop: '15px', padding: '8px', background: 'none', border: '1px solid #ff4444', color: '#ff4444', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
