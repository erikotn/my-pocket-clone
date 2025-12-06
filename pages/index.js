import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  
  // Form States
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [activeTag, setActiveTag] = useState(''); 
  
  // EDITING STATES
  const [editingId, setEditingId] = useState(null); 
  const [editTags, setEditTags] = useState('');     

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // ---------------------------------------------------------
  // 0. INITIALIZATION (Login Check & Share Catching)
  // ---------------------------------------------------------
  
  useEffect(() => {
    // A. Check if password is saved in LocalStorage
    const savedPassword = localStorage.getItem('MY_POCKET_PASSWORD');
    if (savedPassword) {
      setPassword(savedPassword);
      checkLogin(savedPassword);
    }
  }, []);

  useEffect(() => {
    // B. Check if Android shared a link with us
    if (!router.isReady) return;
    
    // Android sends 'text' (usually the URL) or 'title'
    const { text, title, link } = router.query;
    const sharedUrl = text || link; // 'text' is the most common for shared URLs

    if (sharedUrl) {
      // Sometimes Android shares "Check this out: https://url..." 
      // We extract just the URL part if possible
      const urlMatch = sharedUrl.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        setUrl(urlMatch[0]);
      } else {
        setUrl(sharedUrl);
      }
    }
  }, [router.isReady, router.query]);

  // ---------------------------------------------------------
  // 1. DATA LOGIC
  // ---------------------------------------------------------

  async function checkLogin(passToUse) {
    setLoading(true);
    try {
      const res = await fetch('/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passToUse }),
      });
      const json = await res.json();
      if (json.error) {
        // Only clear if user manually typed it, otherwise silent fail
        if (!localStorage.getItem('MY_POCKET_PASSWORD')) setMessage('❌ ' + json.error);
      } else {
        setBookmarks(json.data);
        setIsLoggedIn(true);
        // SAVE PASSWORD TO PHONE so you stay logged in
        localStorage.setItem('MY_POCKET_PASSWORD', passToUse);
        setMessage('');
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function refreshList() {
    // Use the state password
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
    setMessage('Unlocking...');
    checkLogin(password);
  }

  function handleLogout() {
    localStorage.removeItem('MY_POCKET_PASSWORD');
    setIsLoggedIn(false);
    setPassword('');
  }

  // ---------------------------------------------------------
  // 2. SAVING, DELETING & UPDATING
  // ---------------------------------------------------------

  function formatTags(tagString) {
    if (!tagString) return null;
    return tagString.split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0)
      .slice(0, 3)
      .join(', ');
  }

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('Saving...');

    const processedTags = formatTags(tags);

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
      refreshList(); 
    }
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

  function startEditing(item) {
    setEditingId(item.id);
    setEditTags(item.tags || ''); 
  }

  function cancelEditing() {
    setEditingId(null);
    setEditTags('');
  }

  async function saveEdit(id) {
    const processedTags = formatTags(editTags);
    await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, tags: processedTags, password: password }),
    });
    setEditingId(null);
    refreshList();
  }

  async function handleDeleteCategory() {
    if (!activeTag) return;
    const idsToDelete = filteredBookmarks.map(b => b.id);
    if (!confirm(`WARNING: This will delete ALL ${idsToDelete.length} bookmarks tagged "${activeTag}".\n\nAre you sure?`)) return;

    setLoading(true);
    await fetch('/api/delete_batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: idsToDelete, password: password }),
    });
    setLoading(false);
    setActiveTag('');
    refreshList();
  }

  // ---------------------------------------------------------
  // 3. TAG CALCULATION
  // ---------------------------------------------------------
  const allTagsRaw = bookmarks.flatMap(item => item.tags ? item.tags.split(',') : []);
  const uniqueTags = [...new Set(allTagsRaw.map(t => t.trim().toLowerCase()))].sort();

  const filteredBookmarks = bookmarks.filter(item => {
    if (!activeTag) return true;
    return item.tags && item.tags.toLowerCase().includes(activeTag.toLowerCase());
  });

  // ---------------------------------------------------------
  // 4. THE UI
  // ---------------------------------------------------------
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif', padding: '20px' }}>
      {/* THIS HEAD TAG IS CRITICAL FOR ANDROID 
         It links the manifest file we just created.
      */}
      <Head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <title>My Pocket</title>
      </Head>

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h1 style={{margin:0, cursor:'pointer'}} onClick={() => window.location.href='/'}>My Pocket 🔓</h1>
              <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #ccc', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Logout</button>
            </div>
            
            {/* ADD FORM */}
            <div style={{ backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px', maxWidth: '800px', margin: '0 auto 20px auto', border: '1px solid #eee' }}>
              <form onSubmit={handleSave} style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste link..." required style={{ flex: 2, minWidth: '200px', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }} />
                <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags (max 3)" style={{ flex: 1, minWidth: '150px', padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }} />
                <button disabled={loading} style={{ padding: '12px 25px', backgroundColor: 'black', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>{loading ? '...' : 'Save'}</button>
              </form>
              {message && <p style={{ color: message.includes('❌') ? 'red' : 'green', marginTop: '10px', fontWeight: 'bold' }}>{message}</p>}
            </div>
          </div>

          {/* DYNAMIC TAG BAR */}
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '15px', marginBottom: '20px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>
            <button onClick={() => setActiveTag('')} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', backgroundColor: activeTag === '' ? 'black' : '#e0e0e0', color: activeTag === '' ? 'white' : 'black', fontWeight: 'bold' }}>All</button>
            {uniqueTags.map(tag => (
               <button key={tag} onClick={() => setActiveTag(tag)} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', backgroundColor: activeTag === tag ? 'black' : '#f0f0f0', color: activeTag === tag ? 'white' : 'black', textTransform: 'capitalize' }}>{tag}</button>
            ))}
          </div>

          {/* CATEGORY DELETE */}
          {activeTag && filteredBookmarks.length > 0 && (
             <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff0f0', padding: '10px 15px', borderRadius: '8px', border: '1px solid #ffcccc' }}>
                <span style={{ color: '#d00000'}}>Showing {filteredBookmarks.length} items in <b>#{activeTag}</b></span>
                <button onClick={handleDeleteCategory} style={{ backgroundColor: '#d00000', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer' }}>Delete All in #{activeTag}</button>
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
                    
                    {/* EDIT MODE */}
                    {editingId === item.id ? (
                      <div style={{ marginBottom: '10px' }}>
                        <input 
                          type="text" 
                          value={editTags} 
                          onChange={(e) => setEditTags(e.target.value)}
                          placeholder="tech, news..."
                          autoFocus
                          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #333', marginBottom: '5px' }}
                        />
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button onClick={() => saveEdit(item.id)} style={{ flex: 1, padding: '5px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>Save</button>
                          <button onClick={cancelEditing} style={{ flex: 1, padding: '5px', backgroundColor: '#ccc', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                    /* VIEW MODE */
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '5px', marginBottom: '10px', minHeight: '24px' }}>
                        {item.tags && item.tags.split(',').map(t => (
                          <span key={t} style={{ backgroundColor: '#f0f0f0', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', color: '#555' }}>#{t.trim()}</span>
                        ))}
                        <button 
                          onClick={() => startEditing(item)}
                          title="Edit Tags"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#888', padding: '0 5px' }}
                        >
                          ✎
                        </button>
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
