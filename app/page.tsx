import styles from './page.module.css'

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>🚀 Forum Project Ready!</h1>
        <p className={styles.subtitle}>Next.js 15 + TypeScript + Neon PostgreSQL</p>
        
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>✅ Backend API (твоя часть):</h2>
          <ul className={styles.list}>
            <li>📍 /api/hello - проверка API</li>
            <li>🔐 /api/auth - авторизация</li>
            <li>📝 /api/posts - посты</li>
            <li>👥 /api/users - пользователи</li>
          </ul>
        </div>
        
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>🎨 Frontend (часть подруги):</h2>
          <ul className={styles.list}>
            <li>✨ Next.js 15 с App Router</li>
            <li>🎨 TypeScript + чистый CSS</li>
            <li>🔗 Подключен к Backend API</li>
          </ul>
        </div>
        
        <div className={styles.cardSuccess}>
          <p className={styles.successText}>
            🗄️ База данных Neon PostgreSQL подключена!
          </p>
          <p className={styles.successText}>
            ⚡ Всё на одном сервере: <code>http://localhost:3000</code>
          </p>
        </div>
      </div>
    </main>
  )
}
