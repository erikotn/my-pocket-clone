import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Home() {
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [filter, setFilter] = useState('');
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchBookmarks();
  }, []);

  async function fetchBookmarks() {
    const { data } = await supabase
      .from('bookmarks')
      .select('*')
      .order('id', { ascending: false });
    if (data) setBookmarks(data);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('Saving...');
    
    try {
      // Send both the link and the tags to our backend
      await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: url, tags: tags }),
      });
      
      setMessage('Saved!');
      setUrl('');
      setTags('');
      fetchBookmarks(); 
    } catch (err) {
      setMessage('Failed to save.');
    }
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this?')) return;
    
    const { error } = await supabase
      .from('bookmarks')
      .delete()
      .eq('id', id);

    if (error) alert(error.message);
    else fetchBookmarks(); // Refresh list after delete
  }

  // Filter the list based on the search box
  const filteredBookmarks = bookmarks.filter(item => {
    if (!filter) return true;
    // Check if the filter text is inside the title OR the tags
    const tagMatch = item.tags && item.tags.toLowerCase().includes(filter.toLowerCase());
    const titleMatch = item.title && item.title.toLowerCase().includes(filter.toLowerCase());
    return tagMatch || titleMatch;
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif', padding: '20px' }}>
      
      {/* Header Area */}
      <div style={{ marginBottom: '40px', textAlign: 'center' }}>
        <h1>My Pocket</h1>
        
        {/* ADD FORM */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', maxWidth: '800px', margin: '0 auto' }}>
          <input 
            type="url" 
            value={url} 
            onChange={(e) => setUrl(e.target.value)} 
            placeholder="Paste link..." 
            required 
            style={{ flex: 2, padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
          />
          <input 
            type="text" 
            value={tags} 
            onChange={(e) => setTags(e.target.value)} 
            placeholder="Tags (e.g. news, tech)" 
            style={{ flex: 1, padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
          />
          <button disabled={loading} style={{ padding: '12px 25px', backgroundColor: 'black', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
            {loading ? '...' : 'Save'}
          </button>
        </form>
        {message && <p style={{ color: '#666', marginTop: '10px' }}>{message}</p>}
      </div>

      {/* FILTER BAR */}
      <div style={{ marginBottom: '20px' }}>
        <input 
          type="text" 
          placeholder="🔍 Filter by tag or title..." 
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}
        />
      </div>

      {/* GRID LAYOUT */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
        gap: '20px' 
      }}>
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
                {item.tags && (
                  <div style={{ marginBottom: '10px' }}>
                    <span style={{ backgroundColor: '#f0f0f0', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', color: '#555' }}>
                      #{item.tags}
                    </span>
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
