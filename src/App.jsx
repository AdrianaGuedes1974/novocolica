import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy
} from "firebase/firestore";

// ── Firebase config ───────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBVRLiYSNnAczmvUZqDQB4eUeX07U58xT0",
  authDomain: "monitoramento-de-colicas-no-df.firebaseapp.com",
  projectId: "monitoramento-de-colicas-no-df",
  storageBucket: "monitoramento-de-colicas-no-df.firebasestorage.app",
  messagingSenderId: "537456352594",
  appId: "1:537456352594:web:29d82fd7da5e5974e5ee8b",
  measurementId: "G-PXEN9962N9"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const COLL = "incidentes";

// ── Helpers ───────────────────────────────────────────────────────────────────
const canEdit = (inc) => {
  if (!inc?.createdAt) return false;
  const ms = (Date.now() - new Date(inc.createdAt).getTime());
  return ms / 3600000 <= 24;
};
const timeLeft = inc => {
  if (!inc?.createdAt) return null;
  const ms = 24*3600000 - (Date.now() - new Date(inc.createdAt).getTime());
  if (ms <= 0) return null;
  return `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}min`;
};

// ── Date/time ─────────────────────────────────────────────────────────────────
const TIME_OPTIONS = (() => {
  const o = [];
  for (let h=0; h<24; h++) for (let m of [0,15,30,45])
    o.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
  return o;
})();
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const roundTime = d => { const r=Math.round((d.getHours()*60+d.getMinutes())/15)*15; return `${String(Math.floor(r/60)%24).padStart(2,"0")}:${String(r%60).padStart(2,"0")}`; };
const splitDT = iso => {
  if (!iso) { const n=new Date(); return {day:String(n.getDate()).padStart(2,"0"),month:String(n.getMonth()+1).padStart(2,"0"),year:String(n.getFullYear()),time:roundTime(n)}; }
  try { const d=new Date(iso); return {day:String(d.getDate()).padStart(2,"0"),month:String(d.getMonth()+1).padStart(2,"0"),year:String(d.getFullYear()),time:`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`}; }
  catch { return {day:"",month:"",year:"",time:""}; }
};
const joinDT = (day,month,year,time) => (!day||!month||!year) ? "" : `${year}-${month}-${day}T${time||"00:00"}`;
const fmtDT = iso => { if(!iso)return"—"; try{return new Date(iso).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});}catch{return iso;} };

// ── Constants ─────────────────────────────────────────────────────────────────
const LOCAIS     = ["","SHBr","CHLS","MRZ","Phbr","Gemerson","CET","Haras Manes","Manege RM","ASA","Joca","Alonso","Manege Cabral","Haras São Jorge","Chácara Europa","CHP","Outro"];
const SEVERITY   = ["1 – Leve","2 – Moderado","3 – Grave","4 – Crítico"];
const TREATMENTS = ["Banamine / Flunixin","Espasmolítico","Sonda nasogástrica","Fluido IV","Cirurgia","Repouso/Observação","Outro"];
const OUTCOMES   = ["Em acompanhamento","Resolvido","Cirurgia","Óbito"];
const MOTILITY   = ["Normal","Hipomotilidade (reduzida)","Hipermotilidade (aumentada)","Ausente"];
const MUCOSAS    = ["","Róseas (normal)","Pálidas","Hiperêmicas","Cianóticas","Ictéricas","Secas/pegajosas"];
const VOLUMOSOS  = ["","Feno","Alfafa","Capim"];
const SYMPTOMS   = ["Rolando","Cavando","Olhando para o flanco","Recusou comida","Suando","Inchaço","Muito quieto"];

const now = splitDT(new Date().toISOString());
const emptyForm = () => ({
  horse:"", stable:"", stableOther:"", stallNumber:"", caretaker:"", plantonista:"",
  lastRide_day:now.day, lastRide_month:now.month, lastRide_year:now.year, lastRide_time:"",
  lastFeed_day:now.day, lastFeed_month:now.month, lastFeed_year:now.year, lastFeed_time:"",
  susp_day:now.day, susp_month:now.month, susp_year:now.year, susp_time:now.time,
  firstVetArrival_day:"", firstVetArrival_month:"", firstVetArrival_year:"", firstVetArrival_time:"",
  feedBrand:"", feedType:"", feedLote:"", roughageType:"",
  severity:"1 – Leve", symptoms:[], otherSymptom:"",
  heartRate:"", respRate:"", rectalTemp:"", tpc:"", mucosa:"", motility:"Normal", intestinalSounds:"", painScore:"",
  ownerName:"", ownerPhone:"", routineVetName:"", routineVetPhone:"", firstVetName:"", firstVetPhone:"",
  treatment:[], otherTreatment:"", outcome:"Em acompanhamento", vetDiagnosis:"", followUpNotes:"",
  notes:"", mediaFiles:[], recordedBy:""
});

// ── CSS base ──────────────────────────────────────────────────────────────────
const base = { background:"#181818", border:"1px solid #2e2e2e", borderRadius:7, color:"#e8dcc8", padding:"9px 11px", fontSize:14, fontFamily:"inherit", boxSizing:"border-box", width:"100%" };
const inp = {...base};
const sel = {...base, cursor:"pointer"};

// ── DateTimePicker ────────────────────────────────────────────────────────────
function DateTimePicker({prefix, form, sf, showTime=true, required=false}) {
  const [calOpen, setCalOpen] = useState(false);
  const calRef = useRef(null);
  const day=form[`${prefix}_day`]||"", month=form[`${prefix}_month`]||"", year=form[`${prefix}_year`]||"", time=form[`${prefix}_time`]||"";
  const today = new Date();
  const [calYear,  setCalYear]  = useState(year  ? parseInt(year)   : today.getFullYear());
  const [calMonth, setCalMonth] = useState(month ? parseInt(month)-1 : today.getMonth());
  useEffect(() => {
    if (!calOpen) return;
    const h = e => { if (calRef.current && !calRef.current.contains(e.target)) setCalOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [calOpen]);
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const firstDow    = new Date(calYear, calMonth, 1).getDay();
  let cells = Array(firstDow).fill(null);
  for (let d=1; d<=daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = []; for (let i=0; i<cells.length; i+=7) weeks.push(cells.slice(i,i+7));
  const selectDay = d => { sf(`${prefix}_day`,String(d).padStart(2,"0")); sf(`${prefix}_month`,String(calMonth+1).padStart(2,"0")); sf(`${prefix}_year`,String(calYear)); setCalOpen(false); };
  const isSel   = d => d && form[`${prefix}_day`]===String(d).padStart(2,"0") && (calMonth+1)===parseInt(month) && calYear===parseInt(year);
  const isToday = d => d && d===today.getDate() && calMonth===today.getMonth() && calYear===today.getFullYear();
  const prevM = () => { if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1); };
  const nextM = () => { if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1); };
  const displayDate = day && month ? `${day}/${month}/${year}` : "";
  return (
    <div style={{position:"relative"}}>
      <div style={{display:"flex", gap:8}}>
        <button type="button" onClick={()=>setCalOpen(o=>!o)}
          style={{...inp,cursor:"pointer",textAlign:"left",color:displayDate?"#e8dcc8":"#555",flex:showTime?"1.4":"1"}}>
          {displayDate||(required?"📅 Selecionar data":"📅 Data (opcional)")}
        </button>
        {showTime && (
          <select style={{...sel,flex:"1"}} value={time} onChange={e=>sf(`${prefix}_time`,e.target.value)}>
            <option value="">⏱ Hora</option>
            {TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>
      {calOpen && (
        <div ref={calRef} style={{position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:500,background:"#1a1a1a",border:"1px solid #333",borderRadius:10,padding:12,boxShadow:"0 8px 32px #00000099",minWidth:264}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <button onClick={prevM} style={{background:"none",border:"1px solid #333",borderRadius:5,color:"#c8a96e",fontSize:14,cursor:"pointer",padding:"3px 9px",fontFamily:"inherit"}}>‹</button>
            <span style={{color:"#c8a96e",fontSize:13,fontWeight:"bold"}}>{MONTHS[calMonth]} {calYear}</span>
            <button onClick={nextM} style={{background:"none",border:"1px solid #333",borderRadius:5,color:"#c8a96e",fontSize:14,cursor:"pointer",padding:"3px 9px",fontFamily:"inherit"}}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
            {["D","S","T","Q","Q","S","S"].map((d,i)=><div key={i} style={{textAlign:"center",fontSize:9,color:"#555",padding:"2px 0"}}>{d}</div>)}
          </div>
          {weeks.map((wk,wi)=>(
            <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:2}}>
              {wk.map((d,di)=>(
                <div key={di} onClick={()=>d&&selectDay(d)} style={{textAlign:"center",fontSize:13,padding:"6px 2px",borderRadius:5,cursor:d?"pointer":"default",background:isSel(d)?"#c8a96e":isToday(d)?"#c8a96e22":"transparent",color:isSel(d)?"#0d0d0d":d?"#e8dcc8":"transparent",fontWeight:isSel(d)?"bold":"normal",border:isToday(d)&&!isSel(d)?"1px solid #c8a96e44":"1px solid transparent"}}>{d||""}</div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── UI primitives ─────────────────────────────────────────────────────────────
function Field({label,children,hint,span2}) {
  return (
    <div style={{gridColumn:span2?"1 / -1":undefined}}>
      <label style={{display:"block",fontSize:10,color:"#b89050",textTransform:"uppercase",letterSpacing:1.3,marginBottom:6}}>
        {label}{hint&&<span style={{color:"#4a4a4a",textTransform:"none",letterSpacing:0}}> — {hint}</span>}
      </label>
      {children}
    </div>
  );
}
function Grid2({children}) { return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px 12px"}}>{children}</div>; }
function Pill({options,selected,onChange,color="#c8a96e"}) {
  const toggle = o => onChange(selected.includes(o)?selected.filter(s=>s!==o):[...selected,o]);
  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:7,marginTop:2}}>
      {options.map(o=>(
        <button key={o} onClick={()=>toggle(o)} style={{padding:"5px 12px",borderRadius:20,fontSize:12,cursor:"pointer",border:selected.includes(o)?`2px solid ${color}`:"2px solid #252525",background:selected.includes(o)?color+"20":"transparent",color:selected.includes(o)?color:"#666",fontFamily:"inherit",transition:"all .13s"}}>{o}</button>
      ))}
    </div>
  );
}
function Section({icon,title,children,defaultOpen=true}) {
  const [open,setOpen]=useState(defaultOpen);
  return (
    <div style={{background:"#131313",border:"1px solid #1e1e1e",borderRadius:12,marginBottom:10,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",background:"#161616",borderBottom:open?"1px solid #1e1e1e":"none"}}>
        <span style={{fontSize:11,color:"#c8a96e",textTransform:"uppercase",letterSpacing:1.8,fontWeight:"bold"}}>{icon}&nbsp; {title}</span>
        <span style={{color:"#3a3a3a",fontSize:11}}>{open?"▲":"▼"}</span>
      </div>
      {open&&<div style={{padding:"16px",display:"grid",gap:14}}>{children}</div>}
    </div>
  );
}
function VitalBadge({label,value,unit,normal}) {
  const num=parseFloat(value); let c="#2a2a2a";
  if(value&&normal) c=(num>=normal[0]&&num<=normal[1])?"#4caf6a":"#e05c3a";
  return <div style={{background:"#1a1a1a",border:`1px solid ${c}77`,borderRadius:8,padding:"9px 8px",textAlign:"center",minWidth:70}}><div style={{fontSize:18,fontWeight:"bold",color:value?c:"#2a2a2a"}}>{value||"—"}</div><div style={{fontSize:9,color:"#4a4a4a",marginTop:1}}>{unit}</div><div style={{fontSize:9,color:"#555",marginTop:1}}>{label}</div></div>;
}
function MediaUploader({files,onChange}) {
  const fileRef=useRef(null);
  const handleFiles=e=>{ Array.from(e.target.files).forEach(file=>{ const r=new FileReader(); r.onload=ev=>onChange([...(files||[]),{id:Date.now()+Math.random(),name:file.name,type:file.type,dataUrl:ev.target.result}]); r.readAsDataURL(file); }); e.target.value=""; };
  const remove=id=>onChange((files||[]).filter(f=>f.id!==id));
  const isVid=f=>f.type.startsWith("video/");
  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{display:"none"}} onChange={handleFiles}/>
      <div style={{display:"flex",gap:8,marginBottom:files?.length?12:0}}>
        <button type="button" onClick={()=>{fileRef.current.removeAttribute("capture");fileRef.current.click();}} style={{flex:1,padding:"10px",borderRadius:8,background:"#1a1a1a",border:"1px dashed #3a3a3a",color:"#888",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>📎 Galeria</button>
        <button type="button" onClick={()=>{fileRef.current.setAttribute("capture","environment");fileRef.current.click();}} style={{flex:1,padding:"10px",borderRadius:8,background:"#1a1a1a",border:"1px dashed #3a3a3a",color:"#888",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>📷 Câmera</button>
      </div>
      {files?.length>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>{files.map(f=><div key={f.id} style={{position:"relative",borderRadius:8,overflow:"hidden",border:"1px solid #2a2a2a",background:"#1a1a1a",aspectRatio:"1"}}>{isVid(f)?<video src={f.dataUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} muted playsInline onClick={e=>{e.currentTarget.paused?e.currentTarget.play():e.currentTarget.pause();}}/>:<img src={f.dataUrl} alt={f.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>}{isVid(f)&&<div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:22,pointerEvents:"none",opacity:.8}}>▶</div>}<button onClick={()=>remove(f.id)} style={{position:"absolute",top:4,right:4,width:22,height:22,borderRadius:11,background:"#e05c3a",border:"none",color:"#fff",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button><div style={{position:"absolute",bottom:0,left:0,right:0,background:"#00000088",padding:"3px 5px",fontSize:9,color:"#ccc",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{isVid(f)?"🎥":"🖼"} {f.name}</div></div>)}</div>}
    </div>
  );
}

// ── AI Analysis ───────────────────────────────────────────────────────────────
async function analyzePatterns(incidents) {
  if(incidents.length<2) return "Registre ao menos 2 incidentes para análise de padrões.";
  const summary=incidents.map(i=>({cavalo:i.horse,local:i.stable==="Outro"?i.stableOther:i.stable,baia:i.stallNumber,data:joinDT(i.susp_day,i.susp_month,i.susp_year,i.susp_time),gravidade:i.severity,tratador:i.caretaker,plantonista:i.plantonista,ultimaRonda:joinDT(i.lastRide_day,i.lastRide_month,i.lastRide_year,i.lastRide_time),ultimaRacao:joinDT(i.lastFeed_day,i.lastFeed_month,i.lastFeed_year,i.lastFeed_time),racao:[i.feedBrand,i.feedType].filter(Boolean).join(" "),lote:i.feedLote,volumoso:i.roughageType,vitais:{fc:i.heartRate,fr:i.respRate,temp:i.rectalTemp,tpc:i.tpc,motilidade:i.motility,dor:i.painScore},vetPrimeiro:i.firstVetName,diagnostico:i.vetDiagnosis,tratamento:i.treatment,desfecho:i.outcome}));
  const prompt=`Você é um médico veterinário especialista em equinos analisando registros de cólica de uma operação com múltiplos locais de estabulagem.\nAnalise estes ${incidents.length} incidentes e identifique:\n1. **Padrões por animal** — cavalos com recorrência, evolução da gravidade\n2. **Padrões por local** — quais estábulos concentram mais casos\n3. **Manejo** — correlação horário de ração/ronda com ocorrências\n4. **Alimentação** — marca/tipo de ração, lote e volumoso\n5. **Turno** — tratador ou plantonista com maior frequência\n6. **Achados clínicos** — vitais mais alterados\n7. **Recomendações** — medidas práticas e preventivas\nDados: ${JSON.stringify(summary,null,2)}\nResponda em português do Brasil. Use bullet points por seção. Máximo 550 palavras.`;
  const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
  const data=await res.json();
  return data.content?.[0]?.text||"Erro ao analisar.";
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [view,      setView]      = useState("list");
  const [incidents, setIncidents] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [form,      setForm]      = useState(emptyForm());
  const [editId,    setEditId]    = useState(null);
  const [detail,    setDetail]    = useState(null);
  const [analysis,  setAnalysis]  = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState("");
  const [filter,    setFilter]    = useState("");

  // ── Real-time Firestore listener ───────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, COLL), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      setIncidents(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
    return () => unsub();
  }, []);

  const showToast = m => { setToast(m); setTimeout(()=>setToast(""),3200); };
  const sf = (k,v) => setForm(f=>({...f,[k]:v}));
  const stableDisplay = inc => inc.stable==="Outro"?(inc.stableOther||"Outro"):inc.stable;

  const save = async () => {
    if (!form.horse.trim()) { showToast("⚠️ Informe o nome do cavalo."); return; }
    if (!form.susp_day)     { showToast("⚠️ Informe a data da suspeita."); return; }
    setSaving(true);
    try {
      const payload = { ...form, mediaFiles: form.mediaFiles||[] };
      if (editId) {
        await updateDoc(doc(db, COLL, editId), payload);
        showToast("✓ Atualizado.");
      } else {
        payload.createdAt = new Date().toISOString();
        await addDoc(collection(db, COLL), payload);
        showToast("✓ Incidente registrado.");
      }
      setForm(emptyForm()); setEditId(null); setView("list");
    } catch(e) { showToast("❌ Erro ao salvar: " + e.message); }
    setSaving(false);
  };

  const del = async id => {
    if (!confirm("Excluir este incidente?")) return;
    try { await deleteDoc(doc(db, COLL, id)); setView("list"); showToast("Incidente excluído."); }
    catch(e) { showToast("❌ Erro ao excluir."); }
  };

  const startEdit = inc => {
    if (!canEdit(inc)) { showToast("⏰ Janela de 24h encerrada."); return; }
    setForm({...inc}); setEditId(inc.id); setView("form");
  };

  const runAI = async () => { setAnalyzing(true); setView("analysis"); setAnalysis(""); setAnalysis(await analyzePatterns(incidents)); setAnalyzing(false); };

  const sevColor = s => ({"1 – Leve":"#4caf6a","2 – Moderado":"#e8a838","3 – Grave":"#e05c3a","4 – Crítico":"#9c27b0"}[s]||"#888");
  const incDT    = i => joinDT(i.susp_day,i.susp_month,i.susp_year,i.susp_time);

  const filtered = incidents.filter(i => !filter || [i.horse,stableDisplay(i),i.caretaker,i.plantonista,i.ownerName,i.firstVetName,i.recordedBy].some(v=>(v||"").toLowerCase().includes(filter.toLowerCase())));

  const stats = {
    total:    incidents.length,
    month:    incidents.filter(i=>i.susp_month&&parseInt(i.susp_month)-1===new Date().getMonth()).length,
    resolved: incidents.filter(i=>i.outcome==="Resolvido").length,
    critical: incidents.filter(i=>["3 – Grave","4 – Crítico"].includes(i.severity)).length,
  };

  const S = {
    app:   {minHeight:"100vh",background:"#0d0d0d",color:"#e8dcc8",fontFamily:"'Georgia','Times New Roman',serif",maxWidth:700,margin:"0 auto",paddingBottom:90},
    hdr:   {background:"#111",borderBottom:"1px solid #1e1e1e",padding:"14px 18px",position:"sticky",top:0,zIndex:100},
    title: {fontSize:18,fontWeight:"bold",color:"#c8a96e",margin:0},
    sub:   {fontSize:11,color:"#444",margin:"3px 0 0"},
    nav:   {display:"flex",gap:6,marginTop:10},
    nBtn:  a=>({flex:1,padding:"8px",borderRadius:7,fontSize:11,cursor:"pointer",border:a?"1px solid #c8a96e":"1px solid #222",background:a?"#c8a96e18":"transparent",color:a?"#c8a96e":"#555",fontFamily:"inherit",letterSpacing:.5}),
    stats: {display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,padding:"10px 14px"},
    sc:    c=>({background:"#131313",border:`1px solid ${c}33`,borderRadius:9,padding:"9px 6px",textAlign:"center"}),
    sn:    c=>({fontSize:22,fontWeight:"bold",color:c}),
    sl:    {fontSize:9,color:"#555",marginTop:2,textTransform:"uppercase",letterSpacing:.5},
    card:  {background:"#131313",border:"1px solid #1e1e1e",borderRadius:11,margin:"6px 12px",padding:"13px 15px",cursor:"pointer"},
    tag:   c=>({display:"inline-block",background:c+"22",color:c,border:`1px solid ${c}44`,borderRadius:12,padding:"2px 9px",fontSize:11}),
    fab:   {position:"fixed",bottom:22,right:18,width:54,height:54,borderRadius:27,background:"#c8a96e",border:"none",fontSize:26,cursor:"pointer",color:"#0d0d0d",boxShadow:"0 4px 20px #c8a96e55",zIndex:200},
    wrap:  {padding:"14px"},
    btn:   v=>({padding:"11px 18px",borderRadius:8,fontSize:13,cursor:"pointer",fontFamily:"inherit",border:v==="p"?"none":"1px solid #2e2e2e",background:v==="p"?"#c8a96e":"transparent",color:v==="p"?"#0d0d0d":"#888",fontWeight:v==="p"?"bold":"normal"}),
    toast: {position:"fixed",bottom:86,left:"50%",transform:"translateX(-50%)",background:"#1e1e1e",color:"#e8dcc8",padding:"10px 22px",borderRadius:20,fontSize:13,zIndex:300,border:"1px solid #333",whiteSpace:"nowrap",boxShadow:"0 4px 16px #00000099"},
    back:  {background:"none",border:"none",color:"#c8a96e",fontSize:22,cursor:"pointer",padding:"0 8px 0 0",lineHeight:1},
    dr:    {borderBottom:"1px solid #1a1a1a",padding:"9px 0"},
    dlbl:  {fontSize:10,color:"#b89050",textTransform:"uppercase",letterSpacing:1},
    dval:  {fontSize:13,color:"#ccc",marginTop:3},
  };

  // ── LIST ──────────────────────────────────────────────────────────────────
  if (view==="list") return (
    <div style={S.app}>
      <div style={S.hdr}>
        <p style={S.title}>🐴 Rastreio de Cólicas</p>
        <p style={S.sub}>Monitoramento compartilhado · dados em tempo real</p>
        <div style={S.nav}>
          <button style={S.nBtn(true)}>Incidentes</button>
          <button style={S.nBtn(false)} onClick={runAI}>📊 Análise IA</button>
        </div>
      </div>

      <div style={S.stats}>
        {[["#c8a96e","Total",stats.total],["#4caf6a","Este mês",stats.month],["#4aa8e8","Resolvidos",stats.resolved],["#e05c3a","Graves",stats.critical]].map(([c,l,n])=>(
          <div key={l} style={S.sc(c)}><div style={S.sn(c)}>{n}</div><div style={S.sl}>{l}</div></div>
        ))}
      </div>

      <div style={{padding:"2px 12px 8px"}}>
        <input placeholder="🔍 Cavalo, local, tratador…" value={filter} onChange={e=>setFilter(e.target.value)} style={{...inp,background:"#131313",fontSize:13}}/>
      </div>

      {loading && (
        <div style={{textAlign:"center",padding:40,color:"#555"}}>
          <div style={{fontSize:36}}>🔄</div>
          <p style={{marginTop:10,fontSize:13}}>Conectando ao banco de dados…</p>
        </div>
      )}

      {!loading && filtered.length===0 && (
        <div style={{textAlign:"center",padding:52,color:"#3a3a3a"}}>
          <div style={{fontSize:46}}>🐎</div>
          <p style={{marginTop:14,color:"#555"}}>Nenhum incidente registrado.</p>
          <p style={{fontSize:12,color:"#333"}}>Toque em + para adicionar.</p>
        </div>
      )}

      {filtered.map(inc=>(
        <div key={inc.id} style={S.card} onClick={()=>{setDetail(inc);setView("detail");}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontWeight:"bold",fontSize:16}}>{inc.horse}</div>
              <div style={{fontSize:11,color:"#555",marginTop:3}}>
                {stableDisplay(inc)}{inc.stallNumber?` · Baia ${inc.stallNumber}`:""} · {fmtDT(incDT(inc))}
              </div>
              {(inc.caretaker||inc.plantonista)&&<div style={{fontSize:11,color:"#4a4a4a",marginTop:1}}>{[inc.caretaker&&`Trat: ${inc.caretaker}`,inc.plantonista&&`Plant: ${inc.plantonista}`].filter(Boolean).join(" · ")}</div>}
              {inc.recordedBy&&<div style={{fontSize:10,color:"#3a3a3a",marginTop:2}}>Reg: {inc.recordedBy}</div>}
            </div>
            <span style={S.tag(sevColor(inc.severity))}>{inc.severity.split(" – ")[1]}</span>
          </div>
          <div style={{marginTop:9,display:"flex",gap:6,flexWrap:"wrap"}}>
            <span style={S.tag(inc.outcome==="Resolvido"?"#4caf6a":inc.outcome==="Óbito"?"#e05c3a":"#666")}>{inc.outcome}</span>
            {inc.heartRate&&<span style={S.tag("#4aa8e8")}>FC {inc.heartRate} bpm</span>}
            {inc.firstVetName&&<span style={S.tag("#777")}>🩺 {inc.firstVetName}</span>}
            {canEdit(inc)&&<span style={S.tag("#c8a96e")}>✏️ {timeLeft(inc)}</span>}
          </div>
        </div>
      ))}

      <button style={S.fab} onClick={()=>{setForm(emptyForm());setEditId(null);setView("form");}}>+</button>
      {toast&&<div style={S.toast}>{toast}</div>}
    </div>
  );

  // ── FORM ──────────────────────────────────────────────────────────────────
  if (view==="form") return (
    <div style={S.app}>
      <div style={S.hdr}>
        <div style={{display:"flex",alignItems:"center"}}>
          <button style={S.back} onClick={()=>setView("list")}>←</button>
          <div>
            <p style={S.title}>{editId?"Editar Incidente":"Novo Incidente"}</p>
            <p style={S.sub}>Preencha os dados da ocorrência</p>
          </div>
        </div>
      </div>
      <div style={S.wrap}>

        <Section icon="🐴" title="Identificação">
          <Grid2>
            <Field label="Nome do Cavalo *" span2>
              <input style={inp} value={form.horse} onChange={e=>sf("horse",e.target.value)} placeholder="Nome do animal"/>
            </Field>
            <Field label="Local de Estabulagem">
              <select style={sel} value={form.stable} onChange={e=>sf("stable",e.target.value)}>
                {LOCAIS.map(l=><option key={l} value={l}>{l||"— Selecionar —"}</option>)}
              </select>
            </Field>
            <Field label="Número da Baia">
              <input style={inp} value={form.stallNumber} onChange={e=>sf("stallNumber",e.target.value)} placeholder="Ex: 12-A"/>
            </Field>
            {form.stable==="Outro"&&(
              <Field label="Nome do local" span2>
                <input style={inp} value={form.stableOther} onChange={e=>sf("stableOther",e.target.value)} placeholder="Digite o nome do local"/>
              </Field>
            )}
            <Field label="Tratador Responsável">
              <input style={inp} value={form.caretaker} onChange={e=>sf("caretaker",e.target.value)} placeholder="Nome"/>
            </Field>
            <Field label="Plantonista">
              <input style={inp} value={form.plantonista} onChange={e=>sf("plantonista",e.target.value)} placeholder="Nome"/>
            </Field>
          </Grid2>
        </Section>

        <Section icon="🌿" title="Manejo e Alimentação">
          <Field label="Horário da Última Ronda">
            <DateTimePicker prefix="lastRide" form={form} sf={sf} showTime={true}/>
          </Field>
          <Field label="Horário da Última Ração">
            <DateTimePicker prefix="lastFeed" form={form} sf={sf} showTime={true}/>
          </Field>
          <Grid2>
            <Field label="Marca da Ração">
              <input style={inp} value={form.feedBrand} onChange={e=>sf("feedBrand",e.target.value)} placeholder="Ex: Purina"/>
            </Field>
            <Field label="Tipo / Linha">
              <input style={inp} value={form.feedType} onChange={e=>sf("feedType",e.target.value)} placeholder="Ex: Performance"/>
            </Field>
          </Grid2>
          <Field label="Lote da Ração">
            <input style={inp} value={form.feedLote} onChange={e=>sf("feedLote",e.target.value)} placeholder="Número ou código do lote"/>
          </Field>
          <Field label="Tipo de Volumoso">
            <select style={sel} value={form.roughageType} onChange={e=>sf("roughageType",e.target.value)}>
              {VOLUMOSOS.map(v=><option key={v} value={v}>{v||"— Selecionar —"}</option>)}
            </select>
          </Field>
        </Section>

        <Section icon="🚨" title="Ocorrência">
          <Field label="Data e Hora da Suspeita *">
            <DateTimePicker prefix="susp" form={form} sf={sf} showTime={true} required={true}/>
          </Field>
          <Field label="Gravidade">
            <select style={sel} value={form.severity} onChange={e=>sf("severity",e.target.value)}>
              {SEVERITY.map(s=><option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Sintomas Observados">
            <Pill options={SYMPTOMS} selected={form.symptoms} onChange={v=>sf("symptoms",v)}/>
          </Field>
          <Field label="Outros sintomas" hint="opcional">
            <input style={inp} value={form.otherSymptom} onChange={e=>sf("otherSymptom",e.target.value)}/>
          </Field>
        </Section>

        <Section icon="💓" title="Parâmetros Vitais" defaultOpen={false}>
          <p style={{fontSize:11,color:"#4a4a4a",margin:"-4px 0 4px"}}>Ref. equino adulto em repouso</p>
          <Grid2>
            <Field label="FC — Freq. Cardíaca" hint="28–44 bpm">
              <input style={inp} type="number" value={form.heartRate} onChange={e=>sf("heartRate",e.target.value)} placeholder="bpm"/>
            </Field>
            <Field label="FR — Freq. Respiratória" hint="8–16 mrm">
              <input style={inp} type="number" value={form.respRate} onChange={e=>sf("respRate",e.target.value)} placeholder="mrm"/>
            </Field>
            <Field label="Temperatura Retal" hint="37,2–38,5 °C">
              <input style={inp} type="number" step="0.1" value={form.rectalTemp} onChange={e=>sf("rectalTemp",e.target.value)} placeholder="°C"/>
            </Field>
            <Field label="TPC" hint="≤ 2 seg">
              <input style={inp} value={form.tpc} onChange={e=>sf("tpc",e.target.value)} placeholder="normal / lento / seg"/>
            </Field>
            <Field label="Mucosas">
              <select style={sel} value={form.mucosa} onChange={e=>sf("mucosa",e.target.value)}>
                {MUCOSAS.map(m=><option key={m} value={m}>{m||"— Selecionar —"}</option>)}
              </select>
            </Field>
            <Field label="Motilidade Intestinal">
              <select style={sel} value={form.motility} onChange={e=>sf("motility",e.target.value)}>
                {MOTILITY.map(m=><option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Sons intestinais">
              <input style={inp} value={form.intestinalSounds} onChange={e=>sf("intestinalSounds",e.target.value)} placeholder="Ex: ausentes no QID"/>
            </Field>
            <Field label="Escore de dor" hint="0–10">
              <input style={inp} type="number" min="0" max="10" value={form.painScore} onChange={e=>sf("painScore",e.target.value)} placeholder="0 = sem dor"/>
            </Field>
          </Grid2>
          {(form.heartRate||form.respRate||form.rectalTemp)&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>
              <VitalBadge label="FC" value={form.heartRate} unit="bpm" normal={[28,44]}/>
              <VitalBadge label="FR" value={form.respRate}  unit="mrm" normal={[8,16]}/>
              <VitalBadge label="Temp." value={form.rectalTemp} unit="°C" normal={[37.2,38.5]}/>
              {form.tpc&&<VitalBadge label="TPC" value={form.tpc} unit="seg"/>}
            </div>
          )}
        </Section>

        <Section icon="📞" title="Proprietário e Veterinários">
          <Grid2>
            <Field label="Nome do Proprietário">
              <input style={inp} value={form.ownerName} onChange={e=>sf("ownerName",e.target.value)} placeholder="Nome completo"/>
            </Field>
            <Field label="Contato do Proprietário">
              <input style={inp} type="tel" value={form.ownerPhone} onChange={e=>sf("ownerPhone",e.target.value)} placeholder="(00) 00000-0000"/>
            </Field>
            <Field label="Veterinário de Rotina">
              <input style={inp} value={form.routineVetName} onChange={e=>sf("routineVetName",e.target.value)} placeholder="Nome"/>
            </Field>
            <Field label="Contato Vet. Rotina">
              <input style={inp} type="tel" value={form.routineVetPhone} onChange={e=>sf("routineVetPhone",e.target.value)} placeholder="(00) 00000-0000"/>
            </Field>
            <Field label="Vet. 1º Atendimento">
              <input style={inp} value={form.firstVetName} onChange={e=>sf("firstVetName",e.target.value)} placeholder="Nome"/>
            </Field>
            <Field label="Contato Vet. 1º Atend.">
              <input style={inp} type="tel" value={form.firstVetPhone} onChange={e=>sf("firstVetPhone",e.target.value)} placeholder="(00) 00000-0000"/>
            </Field>
          </Grid2>
          <Field label="Chegada do Veterinário">
            <DateTimePicker prefix="firstVetArrival" form={form} sf={sf} showTime={true}/>
          </Field>
          <Field label="Diagnóstico / Avaliação">
            <textarea style={{...inp,minHeight:70,resize:"vertical"}} value={form.vetDiagnosis} onChange={e=>sf("vetDiagnosis",e.target.value)} placeholder="Diagnóstico clínico, exames, observações…"/>
          </Field>
        </Section>

        <Section icon="💊" title="Tratamento e Desfecho">
          <Field label="Tratamentos Realizados">
            <Pill options={TREATMENTS} selected={form.treatment} onChange={v=>sf("treatment",v)} color="#4aa8e8"/>
          </Field>
          <Field label="Outro tratamento" hint="opcional">
            <input style={inp} value={form.otherTreatment} onChange={e=>sf("otherTreatment",e.target.value)}/>
          </Field>
          <Field label="Desfecho">
            <select style={sel} value={form.outcome} onChange={e=>sf("outcome",e.target.value)}>
              {OUTCOMES.map(o=><option key={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Acompanhamento pós-tratamento">
            <textarea style={{...inp,minHeight:60,resize:"vertical"}} value={form.followUpNotes} onChange={e=>sf("followUpNotes",e.target.value)}/>
          </Field>
        </Section>

        <Section icon="📝" title="Observações" defaultOpen={false}>
          <Field label="Notas adicionais">
            <textarea style={{...inp,minHeight:80,resize:"vertical"}} value={form.notes} onChange={e=>sf("notes",e.target.value)}/>
          </Field>
          <Field label="Fotos e Vídeos" hint="opcional">
            <MediaUploader files={form.mediaFiles||[]} onChange={v=>sf("mediaFiles",v)}/>
          </Field>
          <Field label="Registrado por">
            <input style={inp} value={form.recordedBy} onChange={e=>sf("recordedBy",e.target.value)} placeholder="Nome do responsável pelo registro"/>
          </Field>
        </Section>

        <div style={{display:"flex",gap:10,marginTop:4}}>
          <button style={S.btn("g")} onClick={()=>setView("list")}>Cancelar</button>
          <button style={{...S.btn("p"),flex:1}} onClick={save} disabled={saving}>
            {saving?"Salvando no Firebase…":editId?"Salvar Alterações":"Registrar Incidente"}
          </button>
        </div>
      </div>
      {toast&&<div style={S.toast}>{toast}</div>}
    </div>
  );

  // ── DETAIL ────────────────────────────────────────────────────────────────
  if (view==="detail"&&detail) {
    const inc=incidents.find(i=>i.id===detail.id)||detail;
    const DR=({label,value})=>value?<div style={S.dr}><div style={S.dlbl}>{label}</div><div style={S.dval}>{value}</div></div>:null;
    const editable=canEdit(inc);
    return (
      <div style={S.app}>
        <div style={S.hdr}>
          <div style={{display:"flex",alignItems:"center"}}>
            <button style={S.back} onClick={()=>setView("list")}>←</button>
            <div>
              <p style={S.title}>{inc.horse}</p>
              <p style={S.sub}>{stableDisplay(inc)}{inc.stallNumber?` · Baia ${inc.stallNumber}`:""} · {fmtDT(incDT(inc))}</p>
            </div>
          </div>
        </div>
        <div style={{padding:16}}>
          <div style={{background:editable?"#c8a96e18":"#1a1a1a",border:`1px solid ${editable?"#c8a96e44":"#2a2a2a"}`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:editable?"#c8a96e":"#555"}}>
            {editable?`✏️ Editável por mais ${timeLeft(inc)}`:"🔒 Janela de edição de 24h encerrada"}
          </div>
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
            <span style={S.tag(sevColor(inc.severity))}>{inc.severity}</span>
            <span style={S.tag(inc.outcome==="Resolvido"?"#4caf6a":inc.outcome==="Óbito"?"#e05c3a":"#666")}>{inc.outcome}</span>
          </div>
          {(inc.heartRate||inc.respRate||inc.rectalTemp)&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:"#b89050",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Parâmetros Vitais</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <VitalBadge label="FC" value={inc.heartRate} unit="bpm" normal={[28,44]}/>
                <VitalBadge label="FR" value={inc.respRate}  unit="mrm" normal={[8,16]}/>
                <VitalBadge label="Temp." value={inc.rectalTemp} unit="°C" normal={[37.2,38.5]}/>
                {inc.tpc&&<VitalBadge label="TPC" value={inc.tpc} unit="seg"/>}
                {inc.painScore&&<VitalBadge label="Dor" value={inc.painScore} unit="/10"/>}
              </div>
            </div>
          )}
          <DR label="Tratador"         value={inc.caretaker}/>
          <DR label="Plantonista"      value={inc.plantonista}/>
          <DR label="Última ronda"     value={fmtDT(joinDT(inc.lastRide_day,inc.lastRide_month,inc.lastRide_year,inc.lastRide_time))}/>
          <DR label="Última ração"     value={fmtDT(joinDT(inc.lastFeed_day,inc.lastFeed_month,inc.lastFeed_year,inc.lastFeed_time))}/>
          <DR label="Ração"            value={[inc.feedBrand,inc.feedType,inc.feedLote?`Lote: ${inc.feedLote}`:null].filter(Boolean).join(" · ")}/>
          <DR label="Volumoso"         value={inc.roughageType}/>
          <DR label="Sintomas"         value={[...(inc.symptoms||[]),inc.otherSymptom].filter(Boolean).join(", ")}/>
          <DR label="Mucosas"          value={inc.mucosa}/>
          <DR label="Motilidade"       value={inc.motility}/>
          <DR label="Sons intestinais" value={inc.intestinalSounds}/>
          <DR label="Proprietário"     value={inc.ownerName}/>
          <DR label="Contato prop."    value={inc.ownerPhone}/>
          <DR label="Vet. rotina"      value={[inc.routineVetName,inc.routineVetPhone].filter(Boolean).join(" · ")}/>
          <DR label="Vet. 1º atend."   value={[inc.firstVetName,inc.firstVetPhone].filter(Boolean).join(" · ")}/>
          <DR label="Chegada vet."     value={fmtDT(joinDT(inc.firstVetArrival_day,inc.firstVetArrival_month,inc.firstVetArrival_year,inc.firstVetArrival_time))}/>
          <DR label="Diagnóstico"      value={inc.vetDiagnosis}/>
          <DR label="Tratamento"       value={[...(inc.treatment||[]),inc.otherTreatment].filter(Boolean).join(", ")}/>
          <DR label="Acompanhamento"   value={inc.followUpNotes}/>
          {inc.notes&&<DR label="Notas" value={inc.notes}/>}
          <DR label="Registrado por"   value={inc.recordedBy}/>
          {inc.mediaFiles?.length>0&&(
            <div style={S.dr}>
              <div style={S.dlbl}>Fotos e Vídeos</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginTop:8}}>
                {inc.mediaFiles.map(f=>(
                  <div key={f.id} style={{borderRadius:8,overflow:"hidden",border:"1px solid #2a2a2a",aspectRatio:"1",background:"#1a1a1a"}}>
                    {f.type.startsWith("video/")?<video src={f.dataUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} controls muted playsInline/>:<img src={f.dataUrl} alt={f.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {editable&&(
            <div style={{display:"flex",gap:10,marginTop:20}}>
              <button style={{...S.btn("g"),flex:1}} onClick={()=>startEdit(inc)}>✏️ Editar</button>
              <button style={{...S.btn("g"),flex:1,color:"#e05c3a",borderColor:"#e05c3a33"}} onClick={()=>del(inc.id)}>🗑️ Excluir</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── ANALYSIS ──────────────────────────────────────────────────────────────
  if (view==="analysis") return (
    <div style={S.app}>
      <div style={S.hdr}>
        <div style={{display:"flex",alignItems:"center"}}>
          <button style={S.back} onClick={()=>setView("list")}>←</button>
          <div>
            <p style={S.title}>Análise de Padrões</p>
            <p style={S.sub}>IA Veterinária · {incidents.length} incidente{incidents.length!==1?"s":""}</p>
          </div>
        </div>
      </div>
      <div style={{padding:16}}>
        {analyzing?(
          <div style={{textAlign:"center",padding:52,color:"#555"}}>
            <div style={{fontSize:44}}>🔬</div>
            <p style={{marginTop:14,color:"#777"}}>Analisando padrões…</p>
            <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
            <p style={{fontSize:12,color:"#444",animation:"pulse 1.6s infinite",marginTop:6}}>Aguarde</p>
          </div>
        ):(
          <>
            <div style={{background:"#131313",border:"1px solid #222",borderRadius:10,padding:16,marginBottom:12}}>
              <pre style={{whiteSpace:"pre-wrap",fontSize:13,color:"#ccc",lineHeight:1.8,fontFamily:"inherit",margin:0}}>
                {analysis||"Sem análise. Registre ao menos 2 incidentes."}
              </pre>
            </div>
            {analysis&&<button style={{...S.btn("g"),width:"100%"}} onClick={runAI}>🔄 Refazer análise</button>}
          </>
        )}
      </div>
    </div>
  );

  return null;
}
