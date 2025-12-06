import { useState } from 'react';

// Note: We NO LONGER import Supabase here. 
// The frontend is now "blind" to the database.

export default function Home() {
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  
  // Form States
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // 1. LOGIN FUNCTION
  // Instead of loading data on startup, we load it here
  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('Unlocking...');

    try {
      const res = await fetch('/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password }),
      });

      const json = await res.json();

      if (json.error) {
        setMessage('❌ ' + json.error);
        setLoading(false);
      } else {
        setBookmarks(json.data);
        setIsLoggedIn(true); // Unlock the screen
        setMessage('');
        setLoading(false);
      }
    } catch (err) {
      setMessage('Failed to connect.');
      setLoading(false);
    }
  }

  // 2. SAVE FUNCTION
  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('Saving...');
    
    await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: url, tags: tags, password: password }),
    });
    
    setMessage('Saved!');
    setUrl('');
    setTags('');
    // Refresh the list using the secure fetcher
    refreshList(); 
    setLoading(false);
  }

  // 3. DELETE FUNCTION
  async function handleDelete(id) {
    if (!confirm('Delete this?')) return;
    
    await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, password: password }),
    });

    refreshList();
  }

  // Helper to get data again without re-logging in
  async function refreshList() {
    const res = await fetch('/api/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password }),
    });
    const json = await res.json();
    if (json.data) setBookmarks(json.data);
  }

  const filteredBookmarks = bookmarks.filter(item => {
    if (!filter) return true;
    const tagMatch = item.tags && item.tags.toLowerCase().includes(filter.toLowerCase());
    const titleMatch = item.title && item.title.toLowerCase().includes(filter.toLowerCase());
    return tagMatch || titleMatch;
  });

  // --- THE UI ---
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif', padding: '20px' }}>
      
      {/* SCENE 1: LOGIN SCREEN */}
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

      {/* SCENE 2: DASHBOARD (Only shown if isLoggedIn is true) */}
      {isLoggedIn && (
        <>
          <div style={{ marginBottom: '40px', textAlign: 'center' }}>
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
                  placeholder="Tags" 
                  style={{ flex: 1, minWidth: '100px', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
                />
                <button disabled={loading} style={{ padding: '12px 25px', backgroundColor: 'black', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                  {loading ? '...' : 'Save'}
                </button>
              </form>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <input 
              type="text" 
              placeholder="🔍 Filter..." 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {filteredBookmarks.map((item) => (
              <div key={item.id} style={{ border: '1px solid #eee', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: '180px', backgroundColor: '#f0f0f0', overflow: 'hidden' }}>
                  {item.image ? <img src={item.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                </div>
                <div style={{ padding: '15px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ fontSize: '18px', margin: '0 0 8px 0' }}><a href={item.url} target="_blank" style={{ textDecoration: 'none', color: '#333' }}>{item.title || 'Untitled'}</a></h3>
                    {item.tags && <span style={{ backgroundColor: '#f0f0f0', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', color: '#555', marginBottom: '10px', alignSelf: 'flex-start' }}>#{item.tags}</span>}
                    <button onClick={() => handleDelete(item.id)} style={{ marginTop: 'auto', padding: '8px', background: 'none', border: '1px solid #ff4444', color: '#ff4444', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
