/**
 * Custom 404 Not Found Page
 */

export default function NotFound() {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <h1 style={{ fontSize: '4rem', margin: 0 }}>404</h1>
      <p style={{ fontSize: '1.5rem', color: '#666' }}>
        Страница не найдена
      </p>
      <a 
        href="/" 
        style={{ 
          marginTop: '2rem', 
          padding: '0.75rem 1.5rem', 
          backgroundColor: '#0070f3', 
          color: 'white', 
          textDecoration: 'none', 
          borderRadius: '0.5rem' 
        }}
      >
        Вернуться на главную
      </a>
    </div>
  )
}
