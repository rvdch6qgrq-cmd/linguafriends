import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
const examples=[
 {id:'demo-1',kind:'phrase',title:'Useful phrase',body:'Could you say that again, please?',translation:'Не мог(ла) бы ты повторить, пожалуйста?',sender_id:'example',created_at:new Date().toISOString()},
 {id:'demo-2',kind:'text',title:'A sunny weekend',body:'On Saturday, I went to the park with my friends. We had a picnic and talked about our plans.',translation:'В субботу я ходила в парк с друзьями. Мы устроили пикник и поговорили о наших планах.',sender_id:'example',created_at:new Date().toISOString()}
]
function translate(s){window.open('https://translate.google.com/?sl=auto&tl=ru&text='+encodeURIComponent(s)+'&op=translate','_blank','noopener,noreferrer')}
function MaterialAudio({path, localUrl}){
 const [url,setUrl]=useState(localUrl||'');const [speed,setSpeed]=useState(1);const audio=useRef(null);
 useEffect(()=>{let alive=true;if(localUrl){setUrl(localUrl);return}
 if(!path)return;supabase.storage.from('voice-notes').createSignedUrl(path,3600).then(({data,error})=>{if(alive)setUrl(error?'':data?.signedUrl||'')});return()=>{alive=false}},[path,localUrl]);
 return <div className="gift-audio">{url?<><audio ref={audio} controls preload="metadata" src={url}/><button type="button" className="outline-btn" onClick={()=>{const v=speed===1?0.75:1;setSpeed(v);if(audio.current)audio.current.playbackRate=v}}>{speed}×</button></>:<span>Звук недоступен</span>}</div>
}
export default function Materials({user,conversationId,contacts,demo,onSavePhrase,locale}){
 const [items,setItems]=useState(demo?examples:[]),[target,setTarget]=useState(conversationId||''),[kind,setKind]=useState('phrase'),[title,setTitle]=useState(''),[body,setBody]=useState(''),[translation,setTranslation]=useState(''),[videoUrl,setVideoUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[recording,setRecording]=useState(false);
 const recorder=useRef(null),stream=useRef(null),timer=useRef(null),urls=useRef(new Map());
 useEffect(()=>{if(conversationId)setTarget(conversationId)},[conversationId]);
 useEffect(()=>{if(demo){setItems(examples);return}
 if(!target){setItems([]);return}
 let alive=true;
 const load=async()=>{const {data,error:err}=await supabase.from('learning_materials').select('id,conversation_id,sender_id,kind,title,body,translation,video_url,audio_path,created_at').eq('conversation_id',target).order('created_at',{ascending:false}).limit(100);if(alive){if(err)setError('Не удалось загрузить материалы: '+err.message);else{setItems(data||[]);setError('')}}};
 load();const ch=supabase.channel('learning-materials-'+target).on('postgres_changes',{event:'INSERT',schema:'public',table:'learning_materials',filter:'conversation_id=eq.'+target},load).subscribe();
 return()=>{alive=false;supabase.removeChannel(ch)}
 },[target,demo]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());for(const u of urls.current.values())URL.revokeObjectURL(u)},[]);
 const clear=()=>{setTitle('');setBody('');setTranslation('');setVideoUrl('')};
 async function submit(e){
 e.preventDefault();setError('');
 if(!target){setError('Сначала выбери друга');return}
 if(!title.trim()){setError('Укажи название');return}
 if(kind!=='video'&&!body.trim()){setError('Добавь текст или фразу');return}
 if(kind==='video'){try{const u=new URL(videoUrl);if(u.protocol!=='https:')throw Error()}catch{setError('Нужна ссылка https:// на видео');return}}
 setBusy(true);
 try{
  const row={conversation_id:target,sender_id:user.id,kind,title:title.trim(),body:kind==='video'?'':body.trim(),translation:kind==='video'?'':translation.trim(),video_url:kind==='video'?videoUrl:null};
  if(demo){setItems(v=>[{...row,id:crypto.randomUUID(),created_at:new Date().toISOString()},...v])}
  else {const {error:err}=await supabase.from('learning_materials').insert(row);if(err)throw err;const {data}=await supabase.from('learning_materials').select('*').eq('conversation_id',target).order('created_at',{ascending:false}).limit(100);setItems(data||[])}
  clear();
 }catch(err){setError(err.message||'Ошибка отправки')}finally{setBusy(false)}
 }
 async function voice(){
  if(recorder.current?.state==='recording'){recorder.current.stop();return}
  if(!target){setError('Сначала выбери друга');return}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){setError('Микрофон недоступен в этом браузере');return}
  setError('');
  try{
   const s=await navigator.mediaDevices.getUserMedia({audio:true});stream.current=s;
   const mime=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg'].find(x=>MediaRecorder.isTypeSupported(x));
   const rec=new MediaRecorder(s,mime?{mimeType:mime}:{});
   recorder.current=rec;const chunks=[];rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
   rec.onstop=async()=>{
    setRecording(false);if(timer.current)clearTimeout(timer.current);s.getTracks().forEach(t=>t.stop());
    const blob=new Blob(chunks,{type:rec.mimeType?.split(';')[0]||'audio/mp4'});if(!blob.size)return;
    if(blob.size>8388608){setError('Запись слишком большая (максимум 8 МБ)');return}
    setBusy(true);const id=crypto.randomUUID();const path=target+'/'+user.id+'/'+id+(blob.type.includes('webm')?'.webm':blob.type.includes('ogg')?'.ogg':'.m4a');
    try{
     if(demo){const localUrl=URL.createObjectURL(blob);urls.current.set(id,localUrl);setItems(v=>[{id,conversation_id:target,sender_id:user.id,kind:'audio',title:'Голосовая фраза',body:'',created_at:new Date().toISOString(),localUrl},...v]);}
     else{const {error:up}=await supabase.storage.from('voice-notes').upload(path,blob,{contentType:blob.type,upsert:false});if(up)throw up;
      const {error:insert}=await supabase.from('learning_materials').insert({conversation_id:target,sender_id:user.id,kind:'audio',title:'Голосовая фраза',audio_path:path});if(insert)throw insert;
      const {data}=await supabase.from('learning_materials').select('*').eq('conversation_id',target).order('created_at',{ascending:false}).limit(100);setItems(data||[]);
     }
    }catch(err){setError('Не удалось отправить запись: '+err.message)}finally{setBusy(false)}
   };
   rec.start(300);setRecording(true);timer.current=setTimeout(()=>{if(rec.state==='recording')rec.stop()},60000);
  }catch(err){stream.current?.getTracks().forEach(t=>t.stop());setError('Нет доступа к микрофону: '+err.message)}
 }
 return <section className="inner-page gifts-page">
  <div className="page-heading"><span className="page-icon">🎁</span><div><span className="eyebrow">LANGUAGE EXCHANGE</span><h2>{locale==='en'?'Gifts from friends':'Материалы от друзей'}</h2></div></div>
  <p className="lead">Обменивайтесь фразами, небольшими текстами, ссылками на мультфильмы и голосовыми записями. Сохраняй выражения для повторения.</p>
  {demo&&<p className="gift-warning">Демоверсия: примеры вымышлены. Черновики и голосовые не отправляются людям и исчезнут после перезагрузки.</p>}
  <label className="gift-label" htmlFor="gift-contact">С кем делимся?</label>
  <select className="gift-select" id="gift-contact" value={target} onChange={e=>setTarget(e.target.value)}><option value="">Выбери друга</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.other_name}</option>)}</select>
  <div className="gift-list">{items.map(m=><article className="gift-card" key={m.id}>
   <small>{m.kind==='phrase'?'🎙️ Фраза':m.kind==='text'?'📖 Текст':m.kind==='video'?'🎬 Видео':'🔊 Голос'} · {m.sender_id===user.id?'Вы':m.sender_id==='example'?'Пример':'Друг'}</small>
   <h3>{m.title}</h3>{m.body&&<p>{m.body}</p>}{m.translation&&<div className="gift-translation">{m.translation}</div>}
   {m.kind==='video'&&m.video_url&&<a href={m.video_url} target="_blank" rel="noopener noreferrer">▶ Открыть видео</a>}
   {m.kind==='audio'&&<MaterialAudio path={m.audio_path} localUrl={m.localUrl}/>}
   {(m.kind==='phrase'||m.kind==='text')&&<div className="gift-actions"><button className="outline-btn" type="button" onClick={()=>translate(m.body)}>🌍 Перевести</button><button className="outline-btn" type="button" onClick={()=>onSavePhrase(m.body)}>📖 В словарик</button></div>}
  </article>)}{!items.length&&<p className="muted">Пока нет материалов — отправь первый!</p>}</div>
  <h3 className="subheading">Поделиться с другом</h3>
  <form className="gift-form" onSubmit={submit}>
   <label htmlFor="gift-kind">Тип материала</label><select id="gift-kind" value={kind} onChange={e=>setKind(e.target.value)}><option value="phrase">Фраза</option><option value="text">Текст</option><option value="video">Мультфильм / видео</option></select>
   <label htmlFor="gift-title">Название</label><input id="gift-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} required placeholder="Например: Фразы в кафе"/>
   {kind==='video'?<><label htmlFor="gift-url">Ссылка на видео (https://)</label><input id="gift-url" value={videoUrl} onChange={e=>setVideoUrl(e.target.value)} type="url" placeholder="https://..." required/><small>Присылай ссылки на официальные видео, не копии чужих мультфильмов.</small></>:<><label htmlFor="gift-body">Текст или фраза</label><textarea id="gift-body" value={body} onChange={e=>setBody(e.target.value)} rows={4} maxLength={5000} required/><label htmlFor="gift-translation">Перевод или пояснение (необязательно)</label><textarea id="gift-translation" value={translation} onChange={e=>setTranslation(e.target.value)} rows={2} maxLength={5000}/></>}
   <button className="primary" disabled={busy||!target} type="submit">Отправить материал</button>
  </form>
  <div className="gift-voice"><strong>🎙️ Записать фразу своим голосом</strong><p className="muted">До 60 секунд. Друг сможет прослушать запись в своём чате.</p><button type="button" className="primary" onClick={voice} disabled={busy||!target}>{recording?'■ Остановить запись':'🎙️ Записать голос'}</button></div>
  {error&&<p role="alert" className="gift-error">{error}</p>}
  {!demo&&<p className="muted">Материалы видны только участникам выбранного чата. Голосовые хранятся в закрытом облачном хранилище; сквозного шифрования пока нет.</p>}
 </section>
}
