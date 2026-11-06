import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, Check, ChevronLeft, Copy, ExternalLink, Globe2, Heart, Languages, LogOut, MessageCircle, Mic, Plus, Send, Settings, Sparkles, Square, Trash2, UserPlus, Volume2, X, Search, Shield, Flag, UserCheck } from 'lucide-react'
import { supabase, configured } from './supabase'
import Materials from './Materials'
import { dictionaries } from './i18n'

const LANGUAGES = { ru:'Русский', en:'English', es:'Español', fr:'Français', de:'Deutsch', it:'Italiano', pt:'Português', ja:'日本語', ko:'한국어', zh:'中文' }
const DEMO_PARTNERS = [
  { id:'demo-lily', display_name:'Lily', native_language:'en', learning_language:'ru', intro:'Hi! I love books, museums and slow voice chats. 📚' },
  { id:'demo-daniel', display_name:'Daniel', native_language:'en', learning_language:'es', intro:'Looking for friendly conversations about travel and music.' },
  { id:'demo-sofia', display_name:'Sofía', native_language:'es', learning_language:'en', intro:'¡Hola! Let’s practice Spanish and English together.' },
  { id:'demo-luca', display_name:'Luca', native_language:'it', learning_language:'ru', intro:'Ciao! I enjoy cooking, cities and learning languages.' },
  { id:'demo-claire', display_name:'Claire', native_language:'fr', learning_language:'en', intro:'Bonjour! I would love to swap short voice messages.' },
  { id:'demo-max', display_name:'Max', native_language:'de', learning_language:'ru', intro:'Hallo! Happy to practice through text and audio.' }
]
const DEMO_REQUESTS = [
  { id:'demo-request-1', sender_id:'demo-lily', recipient_id:'demo-me', status:'pending', created_at:'2026-11-05T09:00:00Z', other_name:'Lily', native_language:'en', learning_language:'ru' }
]
const DEMO_PROFILE = { id:'demo-me', display_name:'Вы', invite_code:'DEMO2026ABCD', native_language:'ru', learning_language:'en', intro:'', discoverable:false, adult_confirmed:true }

const DEMO_MESSAGES = [
  { id: '1', conversation_id: 'demo-chat', sender_id: 'demo-friend', kind: 'text', body: 'Hey! How was your weekend? 😊', created_at: '2026-11-05T09:13:00Z' },
  { id: '2', conversation_id: 'demo-chat', sender_id: 'demo-me', kind: 'text', body: 'It was great! I visited a museum.', created_at: '2026-11-05T09:14:00Z' },
  { id: '3', conversation_id: 'demo-chat', sender_id: 'demo-friend', kind: 'text', body: 'That sounds lovely! What did you see?', created_at: '2026-11-05T09:15:00Z' }
]
const DEMO_PHRASES = [
  { id: 'demo-phrase1', owner_id: 'demo-me', original: 'That sounds lovely!', translation: 'Звучит замечательно!' },
  { id: 'demo-phrase2', owner_id: 'demo-me', original: 'How was your weekend?', translation: 'Как прошли твои выходные?' }
]

function getSaved(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}
function time(s) { return new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
function explain(error) { return error?.message || String(error) }

function VoiceMessage({ message, demo, t }) {
  const [url, setUrl] = useState(message.audio_url || '')
  const [loading, setLoading] = useState(false)
  const [speed, setSpeed] = useState(1)
  const audioRef = useRef(null)
  const [error, setError] = useState('')
  async function listen() {
    if (url) return
    setLoading(true); setError('')
    try {
      if (!demo) {
        const { data, error: err } = await supabase.storage.from('voice-notes').createSignedUrl(message.audio_path, 3600)
        if (err) throw err
        setUrl(data.signedUrl)
      }
    } catch (err) { setError(explain(err)) } finally { setLoading(false) }
  }
  return <div className="voice-wrap">
    {url ? <div className="voice-player-row"><audio ref={audioRef} controls preload="metadata" src={url} className="voice-audio" /><button type="button" className="speed-button" title={t.audioSpeed} onClick={() => { const next = speed === 1 ? 0.75 : 1; setSpeed(next); if (audioRef.current) audioRef.current.playbackRate = next }}>{speed}×</button></div> : <button className="voice-play" onClick={listen} disabled={loading}>
      <Volume2 size={18} /> {loading ? t.loading : t.voice} <span className="mini-arrow">▶</span>
    </button>}
    {error && <span className="error small">{error}</span>}
  </div>
}

export default function App() {
  const [locale, setLocale] = useState(() => getSaved('lf-locale', navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'))
  const t = dictionaries[locale] || dictionaries.ru
  const demo = !configured
  const [ready, setReady] = useState(demo)
  const [user, setUser] = useState(demo ? { id: 'demo-me', email: 'demo@example.com' } : null)
  const [profile, setProfile] = useState(demo ? getSaved('lf-demo-profile-v2', DEMO_PROFILE) : null)
  const [contacts, setContacts] = useState(demo ? getSaved('lf-demo-contacts-v2', [{ id: 'demo-chat', other_id: 'demo-friend', other_name: 'Emma' }]) : [])
  const [activeId, setActiveId] = useState(demo ? 'demo-chat' : null)
  const [messages, setMessages] = useState(demo ? getSaved('lf-demo-messages', DEMO_MESSAGES) : [])
  const [phrases, setPhrases] = useState(demo ? getSaved('lf-demo-phrases', DEMO_PHRASES) : [])
  const [partners, setPartners] = useState(demo ? DEMO_PARTNERS : [])
  const [requests, setRequests] = useState(demo ? getSaved('lf-demo-requests-v2', DEMO_REQUESTS) : [])
  const [blockedIds, setBlockedIds] = useState(demo ? getSaved('lf-demo-blocks-v2', []) : [])
  const [filterLang, setFilterLang] = useState('en')
  const [finderBusy, setFinderBusy] = useState(false)
  const [reportTarget, setReportTarget] = useState(null)
  const [reportReason, setReportReason] = useState('spam')
  const [discoveryDraft, setDiscoveryDraft] = useState(demo ? getSaved('lf-demo-profile-v2', DEMO_PROFILE) : { ...DEMO_PROFILE })
  const [tab, setTab] = useState('chat')
  const [draft, setDraft] = useState('')
  const [phraseDraft, setPhraseDraft] = useState('')
  const [translationDraft, setTranslationDraft] = useState('')
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [inviteInput, setInviteInput] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [nameDraft, setNameDraft] = useState(demo ? getSaved('lf-demo-profile-v2', DEMO_PROFILE).display_name : '')
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [notice, setNotice] = useState('')
  const [flashIndex, setFlashIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [mobileChat, setMobileChat] = useState(false)
  const recorderRef = useRef(null)
  const stopTimerRef = useRef(null)
  const bottomRef = useRef(null)

  function toast(text) { setNotice(text) }
  function switchLocale(l) { setLocale(l); localStorage.setItem('lf-locale', JSON.stringify(l)) }
  useEffect(() => {
    if (demo) { localStorage.setItem('lf-demo-profile-v2', JSON.stringify(profile)); }
  }, [profile, demo])
  useEffect(() => { if (demo) localStorage.setItem('lf-demo-contacts-v2', JSON.stringify(contacts)) }, [contacts, demo])
  useEffect(() => { if (demo) localStorage.setItem('lf-demo-requests-v2', JSON.stringify(requests)) }, [requests, demo])
  useEffect(() => { if (demo) localStorage.setItem('lf-demo-blocks-v2', JSON.stringify(blockedIds)) }, [blockedIds, demo])

  useEffect(() => {
    if (demo) return
    let mounted = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (mounted) { if (error) toast(explain(error)); setUser(data?.session?.user || null); setReady(true) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) { setUser(session?.user || null); setReady(true) }
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [demo])

  const refreshContacts = useCallback(async () => {
    if (demo || !user) return
    const { data: convs, error } = await supabase.from('conversations').select('id,user_a,user_b,created_at').order('created_at', { ascending: false })
    if (error) { toast(explain(error)); return }
    const ids = [...new Set((convs || []).map(c => c.user_a === user.id ? c.user_b : c.user_a))]
    let people = []
    if (ids.length) {
      const result = await supabase.from('profiles').select('id,display_name').in('id', ids)
      if (result.error) { toast(explain(result.error)); return }
      people = result.data || []
    }
    const names = Object.fromEntries(people.map(p => [p.id, p.display_name]))
    setContacts((convs || []).map(c => {
      const other_id = c.user_a === user.id ? c.user_b : c.user_a
      return { ...c, other_id, other_name: names[other_id] || 'Friend' }
    }))
  }, [demo, user])

  const refreshRequests = useCallback(async () => {
    if (demo || !user) return
    const { data, error } = await supabase.from('partner_requests')
      .select('id,sender_id,recipient_id,status,created_at').order('created_at', { ascending:false }).limit(100)
    if (error) { toast(explain(error)); return }
    const ids = [...new Set((data || []).map(r => r.sender_id === user.id ? r.recipient_id : r.sender_id))]
    let profiles = []
    if (ids.length) {
      const result = await supabase.from('profiles').select('id,display_name,native_language,learning_language').in('id', ids)
      if (result.error) { toast(explain(result.error)); return }
      profiles = result.data || []
    }
    const byId = Object.fromEntries(profiles.map(p => [p.id,p]))
    setRequests((data || []).map(req => {
      const other = byId[req.sender_id === user.id ? req.recipient_id : req.sender_id] || {}
      return { ...req, other_name:other.display_name || 'Friend', native_language:other.native_language || 'en', learning_language:other.learning_language || 'ru' }
    }))
  }, [demo, user?.id])

  const refreshBlocks = useCallback(async () => {
    if (demo || !user) return
    const { data, error } = await supabase.from('blocks').select('blocked_id')
    if (error) toast(explain(error)); else setBlockedIds((data || []).map(b => b.blocked_id))
  }, [demo, user?.id])

  const refreshPartners = useCallback(async (lang = filterLang) => {
    if (demo) { setPartners(DEMO_PARTNERS.filter(p => !lang || p.native_language === lang)); return }
    if (!user || !profile?.adult_confirmed) { setPartners([]); return }
    setFinderBusy(true)
    const { data, error } = await supabase.rpc('find_language_partners', { lang_filter: lang || null })
    setFinderBusy(false)
    if (error) toast(explain(error)); else setPartners(data || [])
  }, [demo, user?.id, profile?.adult_confirmed, filterLang])

  const refreshPhrases = useCallback(async () => {
    if (demo || !user) return
    const { data, error } = await supabase.from('phrases').select('id,original,translation,created_at').order('created_at', { ascending: false }).limit(300)
    if (error) toast(explain(error)); else setPhrases(data || [])
  }, [demo, user])

  useEffect(() => {
    if (!user || demo) return
    supabase.from('profiles').select('id,display_name,invite_code').eq('id', user.id).single().then(({ data, error }) => {
      if (error) toast('Profile: ' + explain(error))
      else { setProfile(data); setNameDraft(data.display_name); setDiscoveryDraft({ native_language:data.native_language || 'ru', learning_language:data.learning_language || 'en', intro:data.intro || '', discoverable:!!data.discoverable, adult_confirmed:!!data.adult_confirmed }); setFilterLang(data.learning_language || 'en') }
    })
    refreshContacts(); refreshPhrases(); refreshRequests(); refreshBlocks()
  }, [user?.id, demo, refreshContacts, refreshPhrases])

  useEffect(() => {
    if (!user || demo) return
    const channel = supabase.channel('contact-changes-' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, refreshContacts)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id, demo, refreshContacts])

  useEffect(() => {
    if (!user || demo || !activeId) return
    let alive = true
    const load = async () => {
      const { data, error } = await supabase.from('messages')
        .select('id,conversation_id,sender_id,kind,body,audio_path,created_at')
        .eq('conversation_id', activeId).order('created_at', { ascending: false }).limit(200)
      if (!alive) return
      if (error) toast(explain(error)); else setMessages((data || []).reverse())
    }
    setMessages([])
    load()
    const channel = supabase.channel('conversation-' + activeId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` }, load)
      .subscribe()
    return () => { alive = false; supabase.removeChannel(channel) }
  }, [user?.id, activeId, demo])

  useEffect(() => {
    if (tab !== 'discover') return
    refreshPartners(filterLang)
    refreshRequests()
  }, [tab, filterLang, profile?.adult_confirmed, refreshRequests])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages.length, activeId])
  useEffect(() => { if (demo) localStorage.setItem('lf-demo-phrases', JSON.stringify(phrases)) }, [phrases, demo])
  useEffect(() => { if (demo) localStorage.setItem('lf-demo-messages', JSON.stringify(messages.filter(m => m.kind !== 'audio'))) }, [messages, demo])

  async function login(e) {
    e.preventDefault(); if (!email.trim()) return
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL } })
    setBusy(false); if (error) toast(explain(error)); else setEmailSent(true)
  }

  async function sendText(e) {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || !activeId || text.length > 3000 || busy) return
    setBusy(true)
    if (demo) {
      setMessages(ms => [...ms, { id: crypto.randomUUID(), conversation_id: activeId, sender_id: user.id, kind: 'text', body: text, created_at: new Date().toISOString() }])
      setDraft('')
    } else {
      const { error } = await supabase.from('messages').insert({ conversation_id: activeId, sender_id: user.id, kind: 'text', body: text })
      if (error) toast(explain(error)); else {
        setDraft('')
        const { data } = await supabase.from('messages').select('id,conversation_id,sender_id,kind,body,audio_path,created_at').eq('conversation_id', activeId).order('created_at', { ascending: false }).limit(200)
        if (data) setMessages(data.reverse())
      }
    }
    setBusy(false)
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  async function toggleRecording() {
    if (recording) { stopRecording(); return }
    if (!activeId || busy) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast(t.errorMic); return
    }
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
      const supportedType = types.find(x => MediaRecorder.isTypeSupported(x))
      const recorder = new MediaRecorder(stream, supportedType ? { mimeType: supportedType, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 })
      const chunks = []
      const conversationAtStart = activeId
      recorderRef.current = recorder
      recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
      recorder.onerror = () => toast(t.errorMic)
      recorder.onstop = async () => {
        clearTimeout(stopTimerRef.current)
        stream.getTracks().forEach(track => track.stop())
        setRecording(false)
        const blobType = recorder.mimeType?.split(';')[0] || chunks[0]?.type?.split(';')[0] || 'audio/webm'
        const blob = new Blob(chunks, { type: blobType })
        if (!blob.size) return
        if (blob.size > 8388608) { toast(t.errorSize); return }
        if (demo) {
          const audio_url = URL.createObjectURL(blob)
          setMessages(ms => [...ms, { id: crypto.randomUUID(), conversation_id: conversationAtStart, sender_id: user.id, kind: 'audio', audio_url, created_at: new Date().toISOString() }])
          return
        }
        setBusy(true)
        try {
          const extension = blobType.includes('mp4') ? 'mp4' : blobType.includes('ogg') ? 'ogg' : blobType.includes('wav') ? 'wav' : 'webm'
          const path = `${conversationAtStart}/${user.id}/${crypto.randomUUID()}.${extension}`
          const { error: uploadError } = await supabase.storage.from('voice-notes').upload(path, blob, { contentType: blobType, upsert: false })
          if (uploadError) throw uploadError
          const { error: insertError } = await supabase.from('messages').insert({ conversation_id: conversationAtStart, sender_id: user.id, kind: 'audio', audio_path: path })
          if (insertError) throw insertError
          if (activeId === conversationAtStart) {
            const { data } = await supabase.from('messages').select('id,conversation_id,sender_id,kind,body,audio_path,created_at').eq('conversation_id', activeId).order('created_at', { ascending: false }).limit(200)
            if (data) setMessages(data.reverse())
          }
        } catch (err) { toast(explain(err)) } finally { setBusy(false) }
      }
      recorder.start(300)
      stopTimerRef.current = setTimeout(() => recorder.state === 'recording' && recorder.stop(), 90000)
      setRecording(true)
    } catch (err) { stream?.getTracks().forEach(track => track.stop()); toast(t.errorMic + ' ' + explain(err)) }
  }

  async function addFriend(e) {
    e.preventDefault()
    if (demo) { toast(t.demoInfo); return }
    if (!inviteInput.trim()) return
    setBusy(true)
    const { data, error } = await supabase.rpc('start_conversation', { friend_code: inviteInput.trim() })
    setBusy(false)
    if (error) { toast(explain(error)); return }
    await refreshContacts()
    setActiveId(data); setTab('chat'); setShowInvite(false); setInviteInput(''); setMobileChat(true)
  }

  async function saveDiscovery(e) {
    e.preventDefault()
    const updates = {
      native_language: discoveryDraft.native_language,
      learning_language: discoveryDraft.learning_language,
      intro: (discoveryDraft.intro || '').trim().slice(0,180),
      discoverable: !!discoveryDraft.discoverable,
      adult_confirmed: !!discoveryDraft.adult_confirmed
    }
    if (updates.discoverable && !updates.adult_confirmed) { toast(t.mustBeAdult); return }
    if (demo) {
      setProfile(p => ({ ...p,...updates }))
      setFilterLang(updates.learning_language)
      toast(t.saved)
      return
    }
    setBusy(true)
    const { error } = await supabase.from('profiles').update(updates).eq('id',user.id)
    setBusy(false)
    if (error) { toast(explain(error)); return }
    setProfile(p => ({ ...p, ...updates }))
    setFilterLang(updates.learning_language)
    toast(t.saved)
  }

  async function requestPartner(person) {
    if (requests.some(r => r.status === 'pending' && (r.sender_id === person.id || r.recipient_id === person.id))) return
    if (demo) {
      setRequests(rs => [{ id:crypto.randomUUID(), sender_id:user.id, recipient_id:person.id, status:'pending', created_at:new Date().toISOString(), other_name:person.display_name, native_language:person.native_language, learning_language:person.learning_language }, ...rs])
      toast(t.requestSent); return
    }
    setFinderBusy(true)
    const { error } = await supabase.rpc('request_language_partner', { partner_id:person.id })
    setFinderBusy(false)
    if (error) toast(explain(error))
    else { await refreshRequests(); toast(t.requestSent) }
  }

  async function answerRequest(req, approve) {
    if (demo) {
      setRequests(rs => rs.map(r => r.id === req.id ? { ...r, status:approve?'accepted':'declined' } : r))
      if (approve) {
        const cid = 'demo-' + req.sender_id
        setContacts(cs => cs.some(c => c.other_id === req.sender_id) ? cs : [{ id:cid, other_id:req.sender_id, other_name:req.other_name }, ...cs])
        setActiveId(cid); setTab('chat'); setMobileChat(true)
      }
      toast(approve?t.connected:t.declined); return
    }
    setFinderBusy(true)
    const { data, error } = await supabase.rpc('answer_language_request',{ request_id:req.id,approve })
    setFinderBusy(false)
    if (error) { toast(explain(error)); return }
    await refreshRequests()
    if (approve && data) { await refreshContacts(); setActiveId(data); setTab('chat'); setMobileChat(true) }
    toast(approve?t.connected:t.declined)
  }

  async function blockPartner(personId) {
    if (!window.confirm(t.confirmBlock)) return
    if (demo) {
      setBlockedIds(ids => [...new Set([...ids,personId])])
      setRequests(rs => rs.filter(r => r.sender_id !== personId && r.recipient_id !== personId))
      setContacts(cs => cs.filter(c => c.other_id !== personId))
      if (contacts.find(c => c.id === activeId)?.other_id === personId) { setActiveId(null); setMobileChat(false) }
      toast(t.blocked); return
    }
    const { error } = await supabase.rpc('block_language_partner', { partner_id:personId })
    if (error) { toast(explain(error)); return }
    setBlockedIds(ids => [...new Set([...ids,personId])]); await refreshRequests()
    if (contacts.find(c => c.id === activeId)?.other_id === personId) { setActiveId(null); setMobileChat(false) }
    toast(t.blocked)
  }

  async function sendReport(e) {
    e.preventDefault()
    if (!reportTarget) return
    if (demo) { toast(t.demoReport); setReportTarget(null); return }
    setBusy(true)
    const { error } = await supabase.rpc('report_language_partner', { partner_id:reportTarget.id, report_reason:reportReason })
    setBusy(false)
    if (error) toast(explain(error)); else { toast(t.reportSubmitted); setReportTarget(null) }
  }

  async function addPhrase(e) {
    e.preventDefault()
    if (!phraseDraft.trim()) return
    const phrase = { original: phraseDraft.trim(), translation: translationDraft.trim() }
    if (demo) setPhrases(ps => [{ id: crypto.randomUUID(), ...phrase }, ...ps])
    else {
      const { error } = await supabase.from('phrases').insert({ ...phrase, owner_id: user.id })
      if (error) { toast(explain(error)); return }
      await refreshPhrases()
    }
    setPhraseDraft(''); setTranslationDraft(''); toast(t.saved)
  }
  async function deletePhrase(id) {
    if (demo) setPhrases(p => p.filter(x => x.id !== id))
    else {
      const { error } = await supabase.from('phrases').delete().eq('id', id)
      if (error) { toast(explain(error)); return }
      await refreshPhrases()
    }
    setFlashIndex(0); setShowAnswer(false)
  }
  function saveFromMessage(body) { setPhraseDraft(body); setTranslationDraft(''); setTab('words'); setMobileChat(false) }
  function translate(text) {
    const target = locale === 'ru' ? 'ru' : 'en'
    window.open(`https://translate.google.com/?sl=auto&tl=${target}&text=${encodeURIComponent(text)}&op=translate`, '_blank', 'noopener,noreferrer')
  }
  async function saveName(e) {
    e.preventDefault()
    if (!nameDraft.trim() || demo) return
    const { error } = await supabase.from('profiles').update({ display_name: nameDraft.trim() }).eq('id', user.id)
    if (error) toast(explain(error))
    else { setProfile(p => ({ ...p, display_name: nameDraft.trim() })); toast(t.saved) }
  }
  async function copyInvite() {
    try { await navigator.clipboard.writeText(profile?.invite_code || ''); toast(t.inviteCopied) }
    catch { toast(profile?.invite_code || '') }
  }
  function switchTab(value) { setTab(value); setMobileChat(false); setNotice('') }

  const visibleContacts = contacts.filter(c => !blockedIds.includes(c.other_id))
  const selectedContact = visibleContacts.find(c => c.id === activeId)
  const visiblePartners = partners.filter(p => !blockedIds.includes(p.id) && !contacts.some(c => c.other_id === p.id) && (!demo || !filterLang || p.native_language === filterLang))
  const incomingRequests = requests.filter(r => r.recipient_id === user.id && r.status === 'pending' && !blockedIds.includes(r.sender_id))
  const outgoingRequests = requests.filter(r => r.sender_id === user.id && r.status === 'pending')
  const activeMessageList = demo ? messages.filter(m => m.conversation_id === activeId) : messages
  const flash = phrases.length ? phrases[flashIndex % phrases.length] : null

  if (!ready) return <div className="full-center"><div className="spinner" />{t.loading}</div>

  if (!user) return <div className="auth-page">
    <div className="auth-card">
      <div className="brand-mark"><Languages size={27}/></div>
      <span className="eyebrow">LINGUAFRIENDS</span>
      <h1>{t.title}</h1>
      <p>{t.subtitle}</p>
      <div className="auth-illustration"><span>Hi! 👋</span><span>Привет! ✨</span><span>Hola! 🌍</span></div>
      <form onSubmit={login} className="auth-form">
        <label htmlFor="email">{t.email}</label>
        <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="hello@example.com" />
        <button className="primary" disabled={busy}>{busy ? t.loading : t.enter}</button>
      </form>
      {emailSent && <p className="success">✓ {t.sent}</p>}
      <div className="locale-switch"><button onClick={() => switchLocale('ru')} className={locale === 'ru' ? 'active' : ''}>RU</button><button onClick={() => switchLocale('en')} className={locale === 'en' ? 'active' : ''}>EN</button></div>
    </div>
  </div>

  return <div className="app-shell">
    <aside className={'sidebar ' + ((mobileChat && tab === 'chat') || tab !== 'chat' ? 'mobile-hidden' : '')}>
      <div className="brand"><div className="brand-mark"><Languages size={24} /></div><div><strong>LinguaFriends</strong><small>talk • learn • connect</small></div></div>
      <div className="sidebar-profile"><div className="avatar own">{(profile?.display_name || 'U').charAt(0).toUpperCase()}</div><div className="who"><b>{profile?.display_name || user.email?.split('@')[0]}</b><small><span className="status-dot"/> {t.online}</small></div><button className="icon-btn" title={t.settings} onClick={() => switchTab('settings')}><Settings size={19}/></button></div>
      <nav className="nav">
        <button className={tab === 'chat' ? 'selected' : ''} onClick={() => switchTab('chat')}><MessageCircle size={19}/>{t.chat}</button>
        <button className={tab === 'discover' ? 'selected' : ''} onClick={() => switchTab('discover')}><Search size={19}/>{t.discover}{incomingRequests.length > 0 && <span className="nav-count">{incomingRequests.length}</span>}</button>
        <button className={tab === 'materials' ? 'selected' : ''} onClick={() => switchTab('materials')}>🎁 {locale === 'ru' ? 'От друзей' : 'Learning gifts'}</button>
        <button className={tab === 'words' ? 'selected' : ''} onClick={() => switchTab('words')}><BookOpen size={19}/>{t.words}<span className="nav-count">{phrases.length}</span></button>
        <button className={tab === 'practice' ? 'selected' : ''} onClick={() => switchTab('practice')}><Sparkles size={19}/>{t.practice}</button>
      </nav>
      {tab === 'chat' && <div className="chat-list">
        <div className="section-heading"><b>{t.messages}</b><button className="icon-btn lavender" title={t.inviteTitle} onClick={() => setShowInvite(!showInvite)}><UserPlus size={18}/></button></div>
        {showInvite && <form className="invite-form" onSubmit={addFriend}><b>{t.inviteTitle}</b><input value={inviteInput} onChange={e => setInviteInput(e.target.value)} placeholder={t.codePlaceholder}/><button className="small-primary" disabled={busy}>{t.connect}</button></form>}
        {!visibleContacts.length && <p className="muted list-empty">{t.noChats}</p>}
        {visibleContacts.map(c => <button className={'person ' + (c.id === activeId ? 'current' : '')} onClick={() => { setActiveId(c.id); setMobileChat(true) }} key={c.id}>
          <div className="avatar person-avatar">{c.other_name.charAt(0).toUpperCase()}</div><span className="person-name"><strong>{c.other_name}</strong><small>{demo ? t.demoHint : '💬'}</small></span><span className="person-chevron">›</span>
        </button>)}
      </div>}
      <div className="sidebar-bottom"><div className="tip"><Heart size={16}/><p>{t.phraseTip}</p></div>{demo && <div className="demo-tag">🧪 {t.demo}</div>}</div>
    </aside>

    <main className={'content ' + (!mobileChat && tab === 'chat' ? 'mobile-content-hidden' : '')}>
      {tab === 'chat' && <>
        {selectedContact ? <>
          <header className="chat-header"><button className="icon-btn mobile-back" onClick={() => setMobileChat(false)} title={t.back}><ChevronLeft /></button><div className="avatar person-avatar">{selectedContact.other_name.charAt(0).toUpperCase()}</div><div className="chat-title"><b>{selectedContact.other_name}</b><small>🌍 {t.partner}</small></div><div className="header-tag"><Globe2 size={16}/> {t.practiceTogether}</div>
            <button className="icon-btn" title={t.report} onClick={() => setReportTarget({ id:selectedContact.other_id, display_name:selectedContact.other_name })}><Flag size={18}/></button>
            <button className="icon-btn" title={t.block} onClick={() => blockPartner(selectedContact.other_id)}><Shield size={18}/></button>
          </header>
          <div className="message-area"><div className="date-pill">{new Date().toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long' })}</div>
            {!activeMessageList.length && <div className="empty-message">{t.emptyMessages}</div>}
            {activeMessageList.map(m => <div className={'message-line ' + (m.sender_id === user.id ? 'mine' : 'theirs')} key={m.id}>
              <div className="bubble">
                {m.kind === 'audio' ? <VoiceMessage key={m.id} message={m} demo={demo} t={t} /> : <div className="bubble-body">{m.body}</div>}
                <div className="bubble-foot"><span>{time(m.created_at)}</span>{m.kind === 'text' && <div className="bubble-actions"><button onClick={() => translate(m.body)} title={t.translate}><Languages size={15}/></button><button onClick={() => saveFromMessage(m.body)} title={t.save}><BookOpen size={15}/></button></div>}</div>
              </div>
            </div>)}
            <div ref={bottomRef}/>
          </div>
          <div className="composer-area">{recording && <div className="recording-bar"><span className="pulsing"/> {t.recording} · {t.recordingLimited}</div>}
            {demo && <div className="demo-inline">{t.localOnly}</div>}
            <form className="composer" onSubmit={sendText}>
              <input aria-label={t.placeholder} placeholder={t.placeholder} value={draft} maxLength={3000} disabled={recording} onChange={e => setDraft(e.target.value)}/>
              <button type="button" className={'mic-button ' + (recording ? 'is-recording' : '')} onClick={toggleRecording} disabled={busy} title={recording ? t.stop : t.record}>{recording ? <Square size={20} fill="currentColor"/> : <Mic size={22}/>}</button>
              <button type="submit" className="send-button" disabled={!draft.trim() || busy || recording} title={t.send}><Send size={20}/></button>
            </form>
          </div>
        </> : <div className="empty-chat"><div className="empty-art">💌</div><h2>{t.choose}</h2><p>{t.noChats}</p><button className="primary" onClick={() => { setShowInvite(true); setMobileChat(false) }}><UserPlus size={18}/>{t.inviteTitle}</button></div>}
      </>}
      {tab === 'discover' && <section className="inner-page discovery-page">
        <div className="page-heading"><span className="page-icon"><Search size={24}/></span><div><span className="eyebrow">LANGUAGE EXCHANGE</span><h2>{t.discover}</h2></div></div>
        <p className="lead">{t.discoverIntro}</p>
        {!profile?.adult_confirmed ? <div className="notice-panel"><Shield size={21}/><div><strong>{t.adultRequired}</strong><p>{t.adultPrompt}</p><button className="small-primary" onClick={() => switchTab('settings')}>{t.openSettings}</button></div></div> : <>
          <div className="filter-row"><label htmlFor="partner-language">{t.partnerSpeaks}</label><select id="partner-language" value={filterLang} onChange={e => setFilterLang(e.target.value)}><option value="">{t.allLanguages}</option>{Object.entries(LANGUAGES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><button className="icon-btn lavender" onClick={() => { refreshPartners(filterLang); refreshRequests() }} title={t.refresh}><Search size={19}/></button></div>
          <div className="privacy-line"><Shield size={16}/>{t.privateDiscovery}</div>
          <h3 className="subheading">{t.incomingRequests}{incomingRequests.length > 0 ? ` (${incomingRequests.length})` : ''}</h3>
          {!incomingRequests.length && <p className="muted">{t.noIncoming}</p>}
          {incomingRequests.map(req => <article className="request-card" key={req.id}><div className="avatar person-avatar">{req.other_name[0]?.toUpperCase()}</div><div className="request-info"><strong>{req.other_name}</strong><small>{LANGUAGES[req.native_language] || req.native_language} → {LANGUAGES[req.learning_language] || req.learning_language}</small><span>{t.wantsToChat}</span></div><div className="request-actions"><button className="small-primary" onClick={() => answerRequest(req,true)} disabled={finderBusy}><UserCheck size={15}/>{t.accept}</button><button className="outline-btn" onClick={() => answerRequest(req,false)} disabled={finderBusy}>{t.decline}</button></div></article>)}
          {!!outgoingRequests.length && <p className="muted request-note">{t.outgoingRequests}: {outgoingRequests.map(r => r.other_name).join(', ')}</p>}
          <h3 className="subheading">{t.suggestedPartners}</h3>
          {finderBusy && <p className="muted">{t.loading}</p>}
          {!finderBusy && !visiblePartners.length && <div className="no-data">{t.noPartners}</div>}
          <div className="partner-grid">{visiblePartners.map(person => <article className="partner-card" key={person.id}>
            <div className="partner-top"><div className="avatar person-avatar">{person.display_name?.[0]?.toUpperCase()}</div><div><strong>{person.display_name}</strong><small>{t.speaks}: {LANGUAGES[person.native_language] || person.native_language}</small><small>{t.learns}: {LANGUAGES[person.learning_language] || person.learning_language}</small></div></div>
            <p>{person.intro || t.noIntro}</p>
            <div className="partner-actions"><button className="small-primary" disabled={finderBusy || requests.some(r => r.status === 'pending' && (r.sender_id === person.id || r.recipient_id === person.id))} onClick={() => requestPartner(person)}><UserPlus size={16}/>{requests.some(r => r.status === 'pending' && (r.sender_id === person.id || r.recipient_id === person.id)) ? t.pending : t.sendRequest}</button><button className="icon-btn" title={t.report} onClick={() => setReportTarget(person)}><Flag size={17}/></button><button className="icon-btn" title={t.block} onClick={() => blockPartner(person.id)}><Shield size={17}/></button></div>
          </article>)}</div>
        </>}
      </section>}
      {tab === 'materials' && <Materials user={user} conversationId={activeId} contacts={visibleContacts} demo={demo} onSavePhrase={saveFromMessage} locale={locale}/>}
       {tab === 'words' && <section className="inner-page"><div className="page-heading"><span className="page-icon"><BookOpen size={24}/></span><div><span className="eyebrow">LANGUAGE JOURNAL</span><h2>{t.words}</h2></div></div><p className="lead">{t.phraseTip}</p>
        <form className="phrase-form" onSubmit={addPhrase}><div className="input-group"><label>{t.phrase}</label><input placeholder="That's a great idea!" value={phraseDraft} maxLength={1000} onChange={e => setPhraseDraft(e.target.value)} required /></div><div className="input-group"><label>{t.translation}</label><input placeholder="Это отличная идея!" value={translationDraft} maxLength={1000} onChange={e => setTranslationDraft(e.target.value)} /></div><button className="primary" type="submit"><Plus size={18}/>{t.addWord}</button></form>
        <div className="phrase-list">{!phrases.length && <div className="no-data">{t.noWords}</div>}{phrases.map(p => <article className="phrase-card" key={p.id}><div><strong>{p.original}</strong><small>{p.translation || '—'}</small></div><div className="phrase-controls"><button className="icon-btn" onClick={() => translate(p.original)} title={t.translate}><ExternalLink size={17}/></button><button className="icon-btn" onClick={() => deletePhrase(p.id)} title={t.delete}><Trash2 size={17}/></button></div></article>)}</div>
      </section>}
      {tab === 'practice' && <section className="inner-page practice-page"><div className="page-heading"><span className="page-icon"><Sparkles size={24}/></span><div><span className="eyebrow">DAILY PRACTICE</span><h2>{t.practice}</h2></div></div>
        {flash ? <><div className="practice-meta"><span>{(flashIndex % phrases.length) + 1} / {phrases.length}</span><span>✨</span></div><button className={'flashcard ' + (showAnswer ? 'flipped' : '')} onClick={() => setShowAnswer(v => !v)}><small>{showAnswer ? t.translation : t.phrase}</small><strong>{showAnswer ? (flash.translation || '—') : flash.original}</strong><span>{showAnswer ? '↻' : '👆 ' + t.flip}</span></button><button className="primary next-btn" onClick={() => { setFlashIndex(i => i + 1); setShowAnswer(false) }}>{t.next} →</button></> : <div className="no-data">{t.noPractice}</div>}
      </section>}
      {tab === 'settings' && <section className="inner-page settings-page"><div className="page-heading"><span className="page-icon"><Settings size={24}/></span><div><span className="eyebrow">ACCOUNT</span><h2>{t.settings}</h2></div></div><div className="settings-card">
        <form onSubmit={saveName}><label>{t.name}</label><div className="input-row"><input value={demo ? (profile?.display_name || '') : nameDraft} disabled={demo} maxLength={60} onChange={e => setNameDraft(e.target.value)}/><button className="small-primary" disabled={demo}>{t.saveName}</button></div></form>
        <label>{t.language}</label><div className="segmented"><button className={locale === 'ru' ? 'active' : ''} onClick={() => switchLocale('ru')}>Русский</button><button className={locale === 'en' ? 'active' : ''} onClick={() => switchLocale('en')}>English</button></div>
        <label>{t.inviteOwn}</label><button className="invite-code" onClick={copyInvite}><span>{profile?.invite_code || '—'}</span><Copy size={19}/></button>
        <div className="settings-divider"/>
        <h3 className="subheading">{t.discoveryProfile}</h3>
        <p className="muted">{t.discoveryPrivacy}</p>
        <form className="discovery-form" onSubmit={saveDiscovery}>
          <label htmlFor="native-lang">{t.native}</label>
          <select id="native-lang" value={discoveryDraft.native_language} onChange={e => setDiscoveryDraft(v => ({...v,native_language:e.target.value}))}>{Object.entries(LANGUAGES).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select>
          <label htmlFor="learning-lang">{t.target}</label>
          <select id="learning-lang" value={discoveryDraft.learning_language} onChange={e => setDiscoveryDraft(v => ({...v,learning_language:e.target.value}))}>{Object.entries(LANGUAGES).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select>
          <label htmlFor="bio">{t.aboutMe}</label>
          <textarea id="bio" maxLength={180} rows={3} value={discoveryDraft.intro} onChange={e => setDiscoveryDraft(v => ({...v,intro:e.target.value}))} placeholder={t.bioPlaceholder}/>
          <label className="check-label"><input type="checkbox" checked={discoveryDraft.adult_confirmed} onChange={e => setDiscoveryDraft(v => ({...v,adult_confirmed:e.target.checked,discoverable:e.target.checked?v.discoverable:false}))}/><span>{t.adultCheck}</span></label>
          <label className="check-label"><input type="checkbox" checked={discoveryDraft.discoverable} disabled={!discoveryDraft.adult_confirmed} onChange={e => setDiscoveryDraft(v => ({...v,discoverable:e.target.checked}))}/><span>{t.visibleCheck}</span></label>
          <button className="primary" disabled={busy} type="submit">{t.saveName}</button>
        </form>
        {demo ? <p className="muted">{t.demoInfo}</p> : <button className="logout" onClick={() => supabase.auth.signOut()}><LogOut size={17}/>{t.logout}</button>}
      </div></section>}
      {tab !== 'chat' && <nav className="mobile-bottom-nav" aria-label="Navigation">
        <button onClick={() => switchTab('chat')}><MessageCircle size={19} />{t.chat}</button>
        <button className={tab === 'discover' ? 'selected' : ''} onClick={() => switchTab('discover')}><Search size={19} />{t.findShort}</button>
        <button className={tab === 'materials' ? 'selected' : ''} onClick={() => switchTab('materials')}>🎁 {locale==='ru'?'Материалы':'Gifts'}</button>
         <button className={tab === 'words' ? 'selected' : ''} onClick={() => switchTab('words')}><BookOpen size={19} />{t.words}</button>
        <button className={tab === 'practice' ? 'selected' : ''} onClick={() => switchTab('practice')}><Sparkles size={19} />{t.practice}</button>
        <button className={tab === 'settings' ? 'selected' : ''} onClick={() => switchTab('settings')}><Settings size={19} />{t.settings}</button>
      </nav>}
    </main>
    {reportTarget && <div className="modal-shade" role="presentation" onClick={() => setReportTarget(null)}><form className="report-modal" onClick={e => e.stopPropagation()} onSubmit={sendReport} role="dialog" aria-modal="true" aria-label={t.report}>
      <h3>{t.report}: {reportTarget.display_name || 'Friend'}</h3><p className="muted">{t.reportNotice}</p>
      <label htmlFor="report-reason">{t.reason}</label><select id="report-reason" value={reportReason} onChange={e => setReportReason(e.target.value)}><option value="spam">{t.reasonSpam}</option><option value="harassment">{t.reasonHarassment}</option><option value="inappropriate">{t.reasonInappropriate}</option><option value="other">{t.reasonOther}</option></select>
      <div className="modal-actions"><button type="button" className="outline-btn" onClick={() => setReportTarget(null)}>{t.cancel}</button><button className="small-primary" disabled={busy}>{t.submitReport}</button></div>
    </form></div>}
    {notice && <div className="toast" role="alert"><span>{notice}</span><button onClick={() => setNotice('')}><X size={17}/></button></div>}
  </div>
}
