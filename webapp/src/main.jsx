import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './style.css'

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false }
  }
  static getDerivedStateFromError() {
    return { crashed: true }
  }
  componentDidCatch(error, info) {
    console.error('LinguaFriends failed to render', error, info)
  }
  render() {
    if (this.state.crashed) {
      return (
        <div style={{minHeight:'100dvh',display:'grid',placeItems:'center',background:'#f7f5fc',padding:24,fontFamily:'system-ui,sans-serif',color:'#302b46'}}>
          <div style={{maxWidth:450,background:'white',padding:28,borderRadius:24}}>
            <h1 style={{fontSize:23}}>LinguaFriends 🌍</h1>
            <p>Не удалось запустить приложение. Попробуй обновить страницу.</p>
            <p style={{fontSize:13,color:'#827694'}}>Если проблема повторится, отправь скриншот этого сообщения, чтобы мы смогли разобраться.</p>
            <button type="button" style={{border:0,borderRadius:12,background:'#7962df',color:'white',padding:'13px 20px',fontSize:16}} onClick={() => window.location.reload()}>Обновить страницу</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(<AppErrorBoundary><App /></AppErrorBoundary>)
