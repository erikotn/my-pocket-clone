import { useState } from 'react';

export default function Home() {
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  
  // Form States
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  
  // Filter States
  const [activeTag, setActiveTag] = useState(''); // The tag button currently clicked
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // ---------------------------------------------------------
  // 1. DATA LOGIC
  // ---------------------------------------------------------

  async function refreshList() {
    const res = await fetch('/api/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password }),
    });
    const json = await res.json();
    if (json.data) setBookmarks(json.data);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('Unlocking...');
    try {
      // We try to fetch. If it works, we know the password is right.
      const res = await fetch('/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password }),
      });
      const json = await res.json();
      if (json.error) {
        setMessage('❌ ' + json.error);
      } else {
        setBookmarks(json.data);
        setIsLoggedIn(true);
        setMessage('');
      }
    } catch (err) {
      setMessage('Failed to connect.');
    }
    setLoading(false);
  }

  // ---------------------------------------------------------
  // 2. SAVING & DELETING
  // ---------------------------------------------------------

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('Saving...');

    // Rule: Max 3 tags. We process the string here.
    // 1. Split by comma, 2. Trim whitespace, 3. Take top 3
    const processedTags = tags.split(',')
      .map(t => t.trim().toLowerCase()) // clean up spaces and casing
      .filter(t => t.length > 0)        // remove empty
      .slice(0, 3)                      // Keep only first 3
      .join(', ');                      // Join back to string

    await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: url, tags: processedTags, password: password }),
    });
    
    setMessage('Saved!');
    setUrl('');
    setTags('');
    refreshList(); 
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this bookmark?')) return;
    await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, password: password }),
    });
    refreshList();
  }

  async function handleDeleteCategory() {
    if (!activeTag) return;
    
    // Find all IDs that are currently visible
    const idsToDelete = filteredBookmarks.map(b => b.id);
    const count = idsToDelete.length;

    // Safety Warning
    const userConfirmed = confirm(
      `WARNING: This will delete ALL ${count} bookmarks tagged "${activeTag}".\n\nAre you sure?`
    );

    if (!userConfirmed) return;

    setLoading(true);
    const res = await fetch('/api/delete_batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: idsToDelete, password: password }),
    });
    
    setLoading(false);
    setActiveTag(''); // Reset filter
    refreshList();    // Refresh data
  }

  // ---------------------------------------------------------
  // 3. TAG CALCULATION
  // ---------------------------------------------------------

  // Extract every unique tag from your list
  const allTagsRaw = bookmarks.flatMap(item => item.tags ? item.tags.split(',') : []);
  const uniqueTags = [...new Set(allTagsRaw.map(t => t.trim().toLowerCase()))].sort();

  // Filter the main list based on which button is clicked
  const filteredBookmarks = bookmarks.filter(item => {
    if (!activeTag) return true; // No filter? Show all.
    return item.tags && item.tags.toLowerCase().includes(activeTag.toLowerCase());
  });


  // ---------------------------------------------------------
  // 4. THE UI
  // ---------------------------------------------------------
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif', padding: '20px' }}>
      
      {/* LOGIN SCREEN */}
      {!isLoggedIn && (
        <div style={{ height: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h1>My Secure Pocket</h1>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '300px' }}>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter Password..."
              style={{ padding: '15px', fontSize: '18px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
            <button style={{ padding: '15px', fontSize: '18px', backgroundColor: 'black', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
              {loading ? 'Checking...' : 'Unlock'}
            </button>
          </form>
          {message && <p style={{ color: 'red', marginTop: '20px' }}>{message}</p>}
        </div>
      )}

      {/* MAIN APP */}
      {isLoggedIn && (
        <>
          <div style={{ marginBottom: '30px', textAlign: 'center' }}>
            <h1 style={{cursor:'pointer'}} onClick={() => window.location.reload()}>My Pocket 🔓</h1>
            
            {/* ADD FORM */}
            <div style={{ backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px', maxWidth: '800px', margin: '0 auto 20px auto', border: '1px solid #eee' }}>
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
                  placeholder="Tags (max 3, comma separated)" 
                  style={{ flex: 1, minWidth: '150px', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
                />
                <button disabled={loading} style={{ padding: '12px 25px', backgroundColor: 'black', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                  {loading ? '...' : 'Save'}
                </button>
              </form>
            </div>
          </div>

          {/* DYNAMIC TAG BAR (Horizontal Scroll) */}
          <div style={{ 
            display: 'flex', 
            gap: '10px', 
            overflowX: 'auto', 
            paddingBottom: '15px', 
            marginBottom: '20px', 
            borderBottom: '1px solid #eee',
            whiteSpace: 'nowrap'
          }}>
            <button 
              onClick={() => setActiveTag('')}
              style={{ 
                padding: '8px 16px', 
                borderRadius: '20px', 
                border: 'none', 
                cursor: 'pointer',
                backgroundColor: activeTag === '' ? 'black' : '#e0e0e0',
                color: activeTag === '' ? 'white' : 'black',
                fontWeight: 'bold'
              }}
            >
              All
            </button>
            {uniqueTags.map(tag => (
               <button 
               key={tag}
               onClick={() => setActiveTag(tag)}
               style={{ 
                 padding: '8px 16px', 
                 borderRadius: '20px', 
                 border: 'none', 
                 cursor: 'pointer',
                 backgroundColor: activeTag === tag ? 'black' : '#f0f0f0',
                 color: activeTag === tag ? 'white' : 'black',
                 textTransform: 'capitalize'
               }}
             >
               {tag}
             </button>
            ))}
          </div>

          {/* CATEGORY DELETE BUTTON (Only shows when a filter is active) */}
          {activeTag && filteredBookmarks.length > 0 && (
             <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff0f0', padding: '10px 15px', borderRadius: '8px', border: '1px solid #ffcccc' }}>
                <span style={{ color: '#d00000'}}>Showing {filteredBookmarks.length} items in <b>#{activeTag}</b></span>
                <button 
                  onClick={handleDeleteCategory}
                  style={{ backgroundColor: '#d00000', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer' }}>
                  Delete All in #{activeTag}
                </button>
             </div>
          )}

          {/* GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {filteredBookmarks.map((item) => (
              <div key={item.id} style={{ border: '1px solid #eee', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: '180px', backgroundColor: '#f0f0f0', overflow: 'hidden' }}>
                  {item.image ? <img src={item.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                </div>
                <div style={{ padding: '15px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ fontSize: '18px', margin: '0 0 8px 0' }}><a href={item.url} target="_blank" style={{ textDecoration: 'none', color: '#333' }}>{item.title || 'Untitled'}</a></h3>
                    
                    {/* Render Tags as little pills */}
                    {item.tags && (
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }}>
                        {item.tags.split(',').map(t => (
                          <span key={t} style={{ backgroundColor: '#f0f0f0', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', color: '#555' }}>
                            #{t.trim()}
                          </span>
                        ))}
                      </div>
                    )}

                    <button onClick={() => handleDelete(item.id)} style={{ marginTop: 'auto', padding: '8px', background: 'none', border: '1px solid #ff4444', color: '#ff4444', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            ))}
            {filteredBookmarks.length === 0 && <p style={{ color: '#999', gridColumn: '1 / -1', textAlign: 'center' }}>No bookmarks found.</p>}
          </div>
        </>
      )}
    </div>
  );
}
