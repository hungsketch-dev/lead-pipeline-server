const express = require('express');
const app = express();
app.use(express.json());
app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');if(req.method==='OPTIONS')return res.sendStatus(200);next();});

const GHL_KEY=process.env.GHL_API_KEY;
const GHL_LOC=process.env.GHL_LOCATION_ID;

// Lusha proxy — forwards requests server-side to bypass CORS
// Anthropic proxy — avoids CORS on hosted/Netlify pages
app.post('/anthropic-proxy', async(req,res)=>{
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','anthropic-version':'2023-06-01','x-api-key':process.env.ANTHROPIC_API_KEY},
      body:JSON.stringify(req.body),
      signal:AbortSignal.timeout(30000)
    });
    const json=await r.json();
    res.status(r.status).json(json);
  }catch(e){res.status(500).json({error:e.message});}
});

// iTunes proxy — avoids CORS on hosted pages
app.get('/itunes-proxy', async(req,res)=>{
  const {id}=req.query;
  if(!id)return res.status(400).json({error:'Missing id'});
  try{
    const r=await fetch('https://itunes.apple.com/lookup?id='+id,{signal:AbortSignal.timeout(10000)});
    const json=await r.json();
    res.json(json);
  }catch(e){res.status(500).json({error:e.message});}
});

// Lusha proxy — avoids CORS on hosted pages
app.post('/lusha-proxy', async(req,res)=>{
  const {url,api_key}=req.body;
  if(!url||!api_key)return res.status(400).json({error:'Missing url or api_key'});
  try{
    const r=await fetch(url,{headers:{'api_key':api_key,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000)});
    const json=await r.json();
    res.status(r.status).json(json);
  }catch(e){res.status(500).json({error:e.message});}
});

// LinkedIn webhook
const GENERIC=new Set(['info','hello','contact','support','marketing','growth','inquiries','partnerships','press','sales','admin','help','feedback','noreply','no-reply','business','careers','hr','legal','privacy','security']);
function classify(email){
  const prefix=(email||'').toLowerCase().split('@')[0];
  const domain=(email||'').toLowerCase().split('@')[1]||'';
  if(GENERIC.has(prefix))return{type:'company',companyName:domain,tags:['company-inbox']};
  const parts=prefix.split(/[.\-_]/);
  return{type:'person',firstName:parts[0]?parts[0][0].toUpperCase()+parts[0].slice(1):'',lastName:parts[1]?parts[1][0].toUpperCase()+parts[1].slice(1):'',tags:['person']};
}
async function upsert(data){
  const payload={...data,locationId:GHL_LOC};
  const noteLines=[];
  if(payload.title){noteLines.push('Position: '+payload.title);delete payload.title;}
  const note=noteLines.join('\n');
  const r=await fetch('https://services.leadconnectorhq.com/contacts/',{method:'POST',headers:{Authorization:'Bearer '+GHL_KEY,'Content-Type':'application/json',Version:'2021-07-28'},body:JSON.stringify(payload)});
  const j=await r.json();
  const id=j.contact?.id||j.id;
  if(id&&note)fetch('https://services.leadconnectorhq.com/contacts/'+id+'/notes',{method:'POST',headers:{Authorization:'Bearer '+GHL_KEY,'Content-Type':'application/json',Version:'2021-07-28'},body:JSON.stringify({body:note})}).catch(()=>{});
  return j;
}
app.post('/webhook/linkedin-ghl',async(req,res)=>{
  try{
    const e=req.body;const cl=classify(e.lead?.email||'');
    const payload={firstName:e.lead?.firstName||cl.firstName||'',lastName:e.lead?.lastName||cl.lastName||'',email:e.lead?.email||'',companyName:e.lead?.company||cl.companyName||'',title:e.lead?.title||'',tags:[...(cl.tags||[])]};
    if(e.type==='connection_accepted')payload.tags.push('li-connected');
    if(e.type==='reply_received')payload.tags.push('li-replied');
    if(e.type==='sequence_ended_no_reply')payload.tags.push('no-reply');
    await upsert(payload);res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.get('/health',(_, res)=>res.json({ok:true,ts:new Date().toISOString()}));
app.listen(process.env.PORT||3000,()=>console.log('Server on port',process.env.PORT||3000));
