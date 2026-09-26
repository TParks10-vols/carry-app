const STORAGE_KEY='carry.inventory.v1';
const VOICE_KEY='carry.voiceURI';
const DIRECTORY_KEY='carry.directory.v1';
const fields=['id','size','contents','location','notes'];
const $=id=>document.getElementById(id);
let inventory=loadInventory();
let recognition=null, speechRecognitionLocal=false, activeMode=null, listening=false, restartTimer=null, speechBusy=false;
let speechTimer=null, speechGeneration=0, voiceEntry=null;
let directoryConfig=loadDirectoryConfig(), directoryNonce=null, directoryTimer=null;
const modeStatus={packing:'Ready to record',unloading:'Ready to listen',unpacking:'Ready to search'};
const modeButtons={packing:'packing-button',unloading:'unloading-button',unpacking:'unpacking-button'};
const modeCards={packing:'packing-card',unloading:'unloading-card',unpacking:'unpacking-card'};
const modeStatusEls={packing:'packing-status',unloading:'unloading-status',unpacking:'unpacking-status'};
const modeLabels={packing:['Start packing dictation','Stop packing dictation'],unloading:['Start unloading listener','Stop unloading listener'],unpacking:['Ask where it is','Cancel unpacking search']};
const voiceEntrySteps=[
  {key:'id',label:'box number or ID',prompt:'What is the box number or item ID?',required:true},
  {key:'size',label:'box size',prompt:'What size is the box? Say skip if unknown.'},
  {key:'contents',label:'contents',prompt:'What is inside the box? Say skip if unknown.'},
  {key:'location',label:'drop location',prompt:'Where should it go? Say the room or exact drop location.',required:true},
  {key:'notes',label:'special instructions',prompt:'Any special instructions? Say none if there are no special instructions.'}
];

function loadInventory(){try{const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(data)?data:[]}catch{return []}}
function loadDirectoryConfig(){try{return JSON.parse(localStorage.getItem(DIRECTORY_KEY)||'null')}catch{return null}}
function saveInventory(){localStorage.setItem(STORAGE_KEY,JSON.stringify(inventory));renderInventory();if(directoryConfig)scheduleDirectoryUpload()}
function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderInventory(){
  $('item-count').textContent=inventory.length;
  $('empty-table').hidden=inventory.length>0;
  $('inventory-rows').innerHTML=inventory.map((item,index)=>`<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.size)}</td><td>${escapeHtml(item.contents)}</td><td>${escapeHtml(item.location)}</td><td>${escapeHtml(item.notes)}</td><td class="row-actions"><button data-edit="${index}">Edit</button><button class="delete" data-delete="${index}">Delete</button></td></tr>`).join('');
  $('inventory-cards').innerHTML=inventory.map((item,index)=>`<article class="mobile-card"><header><strong>${escapeHtml(item.id)}</strong><span>${escapeHtml(item.location||'Location not set')}</span></header><dl>${[['Contents',item.contents],['Size',item.size],['Notes',item.notes]].filter(([,value])=>value).map(([label,value])=>`<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl><footer><button data-edit="${index}">Edit</button><button class="delete" data-delete="${index}">Delete</button></footer></article>`).join('');
}
function normalize(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function boxKey(text){
  const words={zero:'0',oh:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10',eleven:'11',twelve:'12',thirteen:'13',fourteen:'14',fifteen:'15',sixteen:'16',seventeen:'17',eighteen:'18',nineteen:'19',twenty:'20'};
  return normalize(text).replace(/^(box number|box|number) /,'').split(' ').map(word=>words[word]??word).join('');
}
function showAnswer(kicker,title,details){$('answer-kicker').textContent=kicker;$('destination').textContent=title;$('details').textContent=details}
function updateModeUI(){
  for(const mode of Object.keys(modeButtons)){
    const active=activeMode===mode;
    $(modeCards[mode]).classList.toggle('active',active);
    $(modeButtons[mode]).setAttribute('aria-pressed',String(active));
    $(modeButtons[mode]).textContent=modeLabels[mode][active?1:0];
    $(modeStatusEls[mode]).textContent=modeStatus[mode];
  }
}
function setModeStatus(mode,status){modeStatus[mode]=status;updateModeUI()}
function speakingText(text){
  if(!('speechSynthesis'in window)||!text)return;
  const synth=window.speechSynthesis;
  const generation=++speechGeneration;
  clearTimeout(speechTimer);
  speechBusy=true;
  if(activeMode){modeStatus[activeMode]='Speaking a prompt…';updateModeUI()}
  if(listening&&recognition){clearTimeout(restartTimer);try{recognition.stop()}catch{}}
  synth.cancel();
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.lang='en-US';
  const selected=$('voice-select').value;
  if(selected)utterance.voice=synth.getVoices().find(voice=>voice.voiceURI===selected)||null;
  utterance.rate=0.92;
  const finish=()=>{if(generation!==speechGeneration)return;speechBusy=false;if(listening)restartRecognition()};
  utterance.onend=finish;
  utterance.onerror=finish;
  speechTimer=setTimeout(()=>{synth.resume();synth.speak(utterance)},250);
}
function speechForLocation(item){
  const location=item.location?`Take it to ${item.location}.`:'Location not set.';
  const notes=item.notes?.trim().replace(/[.!?]+$/,'');
  return location+(notes?` ${notes}, please.`:'');
}
function lookupBox(raw){
  const query=normalize(raw).replace(/^where (does|should) (.+) go$/, '$2').replace(/^(where is|where s|find|locate) /,'').replace(/^the /,'');$('heard').textContent=raw||'—';
  if(!query){showAnswer('UNLOADING','Say a box ID','Carry will read the destination and special instructions.');return}
  const literal=inventory.filter(row=>normalize(row.id)===query);
  const exact=literal.length?literal:inventory.filter(row=>boxKey(row.id)===boxKey(query));
  const matches=exact.length?exact:inventory.filter(row=>(query.length>=3&&normalize(row.contents).includes(query))||(query.length>=3&&normalize(row.id).includes(query)));
  if(matches.length===1){const item=matches[0];showAnswer('UNLOADING · BOX FOUND',item.location||'Location not set',[item.id,item.size,item.contents,item.notes].filter(Boolean).join(' · ')||'No extra details recorded.');speakingText(speechForLocation(item));}
  else if(matches.length>1){showAnswer('UNLOADING · MULTIPLE MATCHES',matches.map(item=>item.id).join(' · '),'Say the full box ID to choose one.');}
  else showAnswer('UNLOADING · NO MATCH','Not in the inventory','Check the box ID or add the box in the Packing section.');
}
function finishActiveMode(status){
  const mode=activeMode;
  if(!mode)return;
  activeMode=null;listening=false;voiceEntry=null;speechBusy=false;speechGeneration++;
  clearTimeout(restartTimer);clearTimeout(speechTimer);
  window.speechSynthesis?.cancel();
  try{recognition?.stop()}catch{}
  modeStatus[mode]=status;updateModeUI();
}
function restartRecognition(){
  if(!listening||speechBusy||!recognition)return;
  if(activeMode==='packing'&&voiceEntry){
    modeStatus.packing=voiceEntry.phase==='confirm'?'Listening for save or cancel':voiceEntry.phase==='duplicate'?'Listening for replace or cancel':`Listening for ${voiceEntrySteps[voiceEntry.index]?.label||'your answer'}`;
  }else if(activeMode==='unloading')modeStatus.unloading='Listening for box IDs';
  else if(activeMode==='unpacking')modeStatus.unpacking='Listening for one question';
  updateModeUI();
  restartTimer=setTimeout(()=>{try{recognition.start()}catch{}},300);
}

function askVoiceEntryQuestion(){
  if(!voiceEntry)return;
  if(voiceEntry.index>=voiceEntrySteps.length){
    voiceEntry.phase='confirm';
    const v=voiceEntry.values;
    const summary=`I heard box ${v.id}, size ${v.size||'not specified'}, contents ${v.contents||'not specified'}, drop location ${v.location}, special instructions ${v.notes||'none'}. Say save to record it, or cancel.`;
    $('heard').textContent=v.id;
    showAnswer('PACKING · REVIEW ENTRY',v.id,`${v.size||'Size not specified'} · ${v.contents||'Contents not specified'} · ${v.location} · ${v.notes||'No special instructions'}`);
    speakingText(summary);return;
  }
  const step=voiceEntrySteps[voiceEntry.index];
  modeStatus.packing=`Preparing ${step.label}`;updateModeUI();
  showAnswer('PACKING · NEW BOX',step.label,`Say the ${step.label}. You can say “cancel” at any time.`);
  speakingText(step.prompt);
}
function cancelVoiceEntry(){
  finishActiveMode('Box entry canceled');
  showAnswer('PACKING · CANCELED','No box was added','Start packing dictation to enter another box.');
  speakingText('Box entry canceled.');
}
function saveVoiceEntry(replace=false){
  const item=voiceEntry.values;
  if(!item.id.trim()||!item.location.trim()){
    voiceEntry.phase='collect';voiceEntry.index=!item.id.trim()?0:3;askVoiceEntryQuestion();return;
  }
  const existing=inventory.findIndex(row=>normalize(row.id)===normalize(item.id));
  if(existing>=0&&!replace){voiceEntry.phase='duplicate';showAnswer('PACKING · ID ALREADY EXISTS',item.id,'Say replace to update it, or cancel.');speakingText(`A box called ${item.id} is already in the list. Say replace to update it, or cancel.`);return;}
  if(existing>=0)inventory[existing]=item;else inventory.push(item);
  finishActiveMode(`Saved ${item.id}`);saveInventory();
  $('heard').textContent=item.id;
  showAnswer('PACKING · BOX SAVED',item.id,[item.size,item.contents,item.location,item.notes].filter(Boolean).join(' · ')||'Box added to the inventory.');
  speakingText(`Box ${item.id} saved. ${speechForLocation(item)}`);
}
function handleVoiceEntryAnswer(transcript){
  if(!voiceEntry)return;
  const normalized=normalize(transcript);
  if(normalized==='cancel'||normalized==='never mind'||normalized==='cancel entry'){cancelVoiceEntry();return;}
  if(voiceEntry.phase==='confirm'){
    if(normalized==='save'||normalized==='save it'||normalized==='yes'){saveVoiceEntry();return;}
    speakingText('Please say save to record this box, or cancel to discard it.');return;
  }
  if(voiceEntry.phase==='duplicate'){
    if(normalized==='replace'||normalized==='replace it'){saveVoiceEntry(true);return;}
    speakingText('Please say replace to update the existing box, or cancel.');return;
  }
  const step=voiceEntrySteps[voiceEntry.index];
  const skip=['skip','none','no special instructions','nothing','unknown'].includes(normalized);
  const value=skip?'':transcript.trim();
  if(step.required&&!value){speakingText(`I still need the ${step.label}. Please say it, or say cancel.`);return;}
  voiceEntry.values[step.key]=value;voiceEntry.index++;
  if(voiceEntry.index>=voiceEntrySteps.length){askVoiceEntryQuestion();return;}
  const next=voiceEntrySteps[voiceEntry.index];
  $('heard').textContent=transcript;
  speakingText(`Got it. ${next.prompt}`);
}

function distanceAtMostOne(a,b){
  if(Math.abs(a.length-b.length)>1)return false;
  if(a.length===b.length){const different=[];for(let k=0;k<a.length;k++)if(a[k]!==b[k])different.push(k);if(different.length===2){const [x,y]=different;if(y===x+1&&a[x]===b[y]&&a[y]===b[x])return true;}}
  let i=0,j=0,diff=0;
  while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++diff>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}}
  return diff+(i<a.length||j<b.length?1:0)<=1;
}
function unpackQuery(text){
  let query=normalize(text).replace(/^(where is|where s|where can i find|can you find|find|locate) /,'');
  const ignored=new Set(['a','an','the','is','in','of','for','my','our','please','where','box','boxes']);
  return query.split(' ').filter(word=>word&&!ignored.has(word));
}
function searchContents(transcript,{speak=true}={}){
  const queryWords=unpackQuery(transcript);$('heard').textContent=transcript;
  if(!queryWords.length){finishActiveMode('No item name heard');showAnswer('UNPACKING','I did not catch the item','Ask “Where is…” followed by a contents description.');return;}
  const query=queryWords.join(' ');
  const scored=inventory.map(item=>{
    const content=normalize(`${item.id} ${item.contents}`);const contentWords=content.split(' ').filter(Boolean);
    if(!content)return{item,score:0};
    if(content.includes(query))return{item,score:1};
    const tokenScores=queryWords.map(word=>{
      if(contentWords.includes(word))return 1;
      if(word.length>=4&&contentWords.some(candidate=>candidate.startsWith(word)||word.startsWith(candidate)))return .78;
      if(word.length>=4&&contentWords.some(candidate=>candidate.length>=4&&distanceAtMostOne(word,candidate)))return .65;
      return 0;
    });
    return{item,score:tokenScores.reduce((sum,value)=>sum+value,0)/tokenScores.length};
  }).filter(entry=>entry.score>=.45).sort((a,b)=>b.score-a.score).slice(0,4).map(entry=>entry.item);
  finishActiveMode(scored.length?'Search complete':'No contents match');
  if(!scored.length){showAnswer('UNPACKING · NO CLOSE MATCH','No box found','Try a different word or phrase from the item name or contents.');if(speak)speakingText('I could not find a close match. Try another description.');return;}
  const descriptions=scored.map(item=>`${item.id} — ${item.location||'location not set'}${item.contents?` (${item.contents})`:''}`);
  const title=scored.length===1?`Box ${scored[0].id}`:`Possible boxes: ${scored.map(item=>item.id).join(', ')}`;
  showAnswer('UNPACKING · CONTENTS MATCH',title,descriptions.join(' · '));
  if(speak)speakingText(scored.length===1?`I found it in Box ${scored[0].id}, at ${scored[0].location||'a location not set'}.`:`Possible matches. ${scored.map(item=>`Box ${item.id}, at ${item.location||'a location not set'}.`).join(' ')}`);
}
function routeTranscript(transcript){
  $('heard').textContent=transcript;
  if(activeMode==='packing'){handleVoiceEntryAnswer(transcript);return;}
  if(activeMode==='unpacking'){searchContents(transcript);return;}
  if(activeMode==='unloading'){
    lookupBox(transcript);
  }
}

function setupRecognition(){
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech)return{ok:false,message:'This browser does not support voice input. Try Chrome on Android or use typed search.'};
  if(recognition)return{ok:true};
  return{ok:true,Speech};
}
async function prepareRecognition(mode){
  const setup=setupRecognition();
  if(!setup.ok){setModeStatus(mode,'Voice input unavailable');showAnswer('VOICE UNAVAILABLE','Use typed search',setup.message);return false;}
  if(recognition)return true;
  const hasLocalPackApi=typeof setup.Speech.available==='function'&&typeof setup.Speech.install==='function';
  if(hasLocalPackApi){
    const options={langs:['en-US'],processLocally:true};
    try{
      const availability=await setup.Speech.available(options);
      if(availability==='available')speechRecognitionLocal=true;
      else if(availability==='downloadable'||availability==='downloading'){
        setModeStatus(mode,'Downloading offline voice pack…');
        const installed=await setup.Speech.install(options);
        if(installed){setModeStatus(mode,'Voice pack ready · tap again to start');return false;}
      }
    }catch{speechRecognitionLocal=false;}
  }
  try{
    recognition=new setup.Speech();
    recognition.lang='en-US';recognition.continuous=true;recognition.interimResults=true;
    if('processLocally'in recognition)recognition.processLocally=speechRecognitionLocal;
    recognition.onresult=event=>{for(let i=event.resultIndex;i<event.results.length;i++){const transcript=event.results[i][0].transcript.trim();if(event.results[i].isFinal)routeTranscript(transcript)}};
    recognition.onerror=event=>{
      if(event.error==='no-speech'||event.error==='aborted')return;
      const modeAtError=activeMode;
      activeMode=null;listening=false;voiceEntry=null;speechBusy=false;clearTimeout(restartTimer);updateModeUI();
      if(modeAtError)setModeStatus(modeAtError,event.error==='not-allowed'?'Microphone permission denied':`Voice error: ${event.error}`);
      if(event.error==='not-allowed'||event.error==='service-not-allowed')$('offline-label').textContent='Allow Carry microphone access';
      else if(event.error==='network'||event.error==='language-not-supported')showAnswer('VOICE UNAVAILABLE','Voice recognition could not start',speechRecognitionLocal?'Check the English voice pack and try again.':'Connect to the internet or use typed search.');
    };
    recognition.onend=()=>{if(listening&&!speechBusy)restartRecognition()};
    return true;
  }catch{
    recognition=null;
    setModeStatus(mode,'Could not prepare voice input');
    showAnswer('VOICE UNAVAILABLE','Voice setup failed','Try Chrome on Android, allow microphone access, or use typed search.');return false;
  }
}
async function startMode(mode){
  if(activeMode)stopMode('Stopped');
  setModeStatus(mode,'Preparing voice input…');
  const ready=await prepareRecognition(mode);
  if(!ready)return;
  activeMode=mode;listening=true;
  modeStatus[mode]=mode==='packing'?'Starting box entry':mode==='unloading'?'Listening for box IDs':'Listening for one question';
  updateModeUI();
  if(mode==='packing'){
    try{recognition.start();}catch{listening=false;activeMode=null;setModeStatus(mode,'Microphone is starting; tap again');return;}
    voiceEntry={phase:'collect',index:0,values:{id:'',size:'',contents:'',location:'',notes:''}};
    $('heard').textContent='—';showAnswer('PACKING · NEW BOX','Starting box entry','Answer each prompt. Say “cancel” at any time.');askVoiceEntryQuestion();return;
  }
  try{recognition.start();}
  catch{listening=false;activeMode=null;setModeStatus(mode,'Microphone is starting; click again');return;}
  if(mode==='unloading')showAnswer('UNLOADING · LISTENING','Say a box ID','Carry will read the destination and special instructions.');
  else{showAnswer('UNPACKING · LISTENING','Ask “Where is…”','Say the item or contents you want to find. Carry will listen for one question.');}
}
function stopMode(status='Ready'){
  const mode=activeMode;if(!mode)return;
  activeMode=null;listening=false;voiceEntry=null;speechBusy=false;speechGeneration++;
  clearTimeout(restartTimer);clearTimeout(speechTimer);window.speechSynthesis?.cancel();
  try{recognition?.stop()}catch{}
  modeStatus[mode]=status;updateModeUI();
}

function directorySetStatus(message,busy=false){
  $('directory-status').textContent=message;
  $('directory-feedback').textContent=message;
  $('directory-indicator').classList.toggle('busy',busy);
  $('directory-sync').disabled=busy;
  $('directory-upload').disabled=busy;
  $('directory-download').disabled=busy;
}
function directoryUI(){
  const connected=Boolean(directoryConfig?.url&&directoryConfig?.key);
  $('directory-bar').hidden=!connected;
  $('directory-button').textContent=connected?'Directory settings':'Connect directory';
  if(connected){$('directory-url').value=directoryConfig.url;$('directory-key').value=directoryConfig.key;$('directory-status').textContent='Directory saved on this device';}
}
function directoryRequest(action,inventorySnapshot){
  return new Promise((resolve,reject)=>{
    if(!directoryConfig?.url||!directoryConfig?.key){reject(new Error('Add the web app URL and shared access key first.'));return;}
    const frame=$('directory-frame');
    const nonce=window.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    directoryNonce=nonce;
    const form=document.createElement('form');form.method='post';form.action=directoryConfig.url;form.target='directory-frame';form.hidden=true;
    const values={action,key:directoryConfig.key,nonce};
    if(inventorySnapshot)values.inventory=JSON.stringify(inventorySnapshot);
    for(const [name,value] of Object.entries(values)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);}
    document.body.appendChild(form);
    const timeout=setTimeout(()=>{if(directoryNonce===nonce){directoryNonce=null;form.remove();reject(new Error('No reply from the sheet. Check the URL, access key, and web app deployment.'));}},20000);
    const finish=event=>{
      // Apps Script redirects web-app responses to googleusercontent.com. Match
      // the one-time nonce and Google's response origin; Safari can report the
      // redirected iframe's source differently from its original window.
      let responseHost='';
      try{responseHost=new URL(event.origin).hostname;}catch{}
      const fromAppsScript=responseHost==='script.google.com'||responseHost.endsWith('.googleusercontent.com');
      if(!fromAppsScript||!event.data||event.data.type!=='carry-directory'||event.data.nonce!==nonce)return;
      clearTimeout(timeout);window.removeEventListener('message',finish);directoryNonce=null;form.remove();
      if(!event.data.ok){reject(new Error(event.data.error||'The sheet could not complete the request.'));return;}
      resolve(event.data);
    };
    window.addEventListener('message',finish);
    form.submit();
  });
}
function storeDirectoryConfig(url,key){
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec\/?$/.test(parsed.pathname))throw new Error('Paste the deployed Google Apps Script web app URL ending in /exec.');
  if(!key.trim())throw new Error('Enter the shared access key from the Apps Script settings.');
  directoryConfig={url:parsed.href.replace(/\/$/,''),key:key.trim()};
  localStorage.setItem(DIRECTORY_KEY,JSON.stringify(directoryConfig));directoryUI();
}
async function uploadDirectory(snapshot=inventory){
  try{directorySetStatus('Sending changes to the sheet…',true);await directoryRequest('write',snapshot);directorySetStatus(`Sheet updated · ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`);}
  catch(error){directorySetStatus(`Sync paused · ${error.message}`);}
}
function scheduleDirectoryUpload(){
  clearTimeout(directoryTimer);directoryTimer=setTimeout(()=>uploadDirectory(inventory.slice()),800);
}
async function downloadDirectory(){
  try{
    directorySetStatus('Loading the shared list…',true);
    const result=await directoryRequest('read');
    if(!Array.isArray(result.inventory))throw new Error('The sheet reply had no inventory list.');
    inventory=result.inventory.map(row=>({id:String(row.id||''),size:String(row.size||''),contents:String(row.contents||''),location:String(row.location||''),notes:String(row.notes||'')})).filter(row=>row.id);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(inventory));renderInventory();
    directorySetStatus(`Loaded ${inventory.length} items from the sheet.`);
    $('inventory-hint').textContent='This device is connected to the shared online directory.';
    $('directory-dialog').close();
  }catch(error){directorySetStatus(`Could not load sheet · ${error.message}`);}
}
function openDirectoryDialog(){$('directory-feedback').textContent=directoryConfig?'Download replaces this device’s list; upload replaces the sheet’s rows.':'First set up the Google Apps Script using the included Carry guide, then paste its deployed URL and shared key here.';$('directory-dialog').showModal()}
function csvEscape(value){return `"${String(value??'').replaceAll('"','""')}"`}
function exportCSV(){const rows=[['Box Number/ID','Box Size','Contents','Drop Location','Special Notes'],...inventory.map(item=>fields.map(field=>item[field]||''))];const blob=new Blob(['\ufeff'+rows.map(row=>row.map(csvEscape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Moving Inventory.csv';a.click();URL.revokeObjectURL(a.href)}
function parseCSV(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}return rows}
function importCSV(file){
  const reader=new FileReader();
  reader.onload=()=>{
    const rows=parseCSV(String(reader.result).replace(/^\ufeff/,''));
    if(rows.length<2)return;
    const header=rows.shift().map(normalize);
    const aliases=[['box number id','id'],['box size','size'],['contents','contents'],['drop location','location'],['special notes','notes']];
    const columns={};
    aliases.forEach(([heading,field])=>columns[field]=header.indexOf(normalize(heading)));
    const incoming=rows.filter(row=>row.some(Boolean)).map(row=>{
      const item={};
      for(const field of fields){
        const column=columns[field];
        item[field]=column>=0?(row[column]||'').trim():'';
      }
      return item;
    }).filter(item=>item.id);
    if(!incoming.length){alert('No box rows found. Use columns Box Number/ID, Box Size, Contents, Drop Location, and Special Notes.');return;}
    inventory=incoming;saveInventory();
    $('inventory-hint').textContent=`Loaded ${incoming.length} items. They are saved on this device.`;
  };
  reader.readAsText(file);
}
function openEditor(item,index){$('item-form').reset();$('edit-id').value=index??'';$('dialog-title').textContent=index===undefined?'Add item':'Edit item';$('item-id').value=item?.id||'';$('item-size').value=item?.size||'';$('item-contents').value=item?.contents||'';$('item-location').value=item?.location||'';$('item-notes').value=item?.notes||'';$('item-dialog').showModal()}
function submitItem(event){event.preventDefault();const item={id:$('item-id').value.trim(),size:$('item-size').value.trim(),contents:$('item-contents').value.trim(),location:$('item-location').value.trim(),notes:$('item-notes').value.trim()};const index=$('edit-id').value;if(index==='')inventory.push(item);else inventory[Number(index)]=item;saveInventory();$('item-dialog').close()}

function refreshVoiceOptions(){
  if(!('speechSynthesis'in window))return;
  const select=$('voice-select');const previous=select.value||localStorage.getItem(VOICE_KEY)||'';
  const voices=window.speechSynthesis.getVoices().slice().sort((a,b)=>a.name.localeCompare(b.name));
  select.innerHTML='<option value="">System default</option>';
  for(const voice of voices){const option=document.createElement('option');option.value=voice.voiceURI;option.textContent=`${voice.name} · ${voice.lang} · ${voice.localService===false?'online':'on device'}`;select.appendChild(option);}
  if(voices.some(voice=>voice.voiceURI===previous))select.value=previous;
  $('voice-help').textContent=voices.length?'On-device voices can work offline; online voices need internet.':'No voice list is available yet. Try refreshing this page.';
}

for(const mode of Object.keys(modeButtons))$(modeButtons[mode]).addEventListener('click',()=>activeMode===mode?stopMode():startMode(mode));
$('add-button').addEventListener('click',()=>openEditor());
$('typed-search').addEventListener('submit',event=>{event.preventDefault();const query=$('search-query').value.trim();if(!query)return;if(/^#?\s*\d+$/i.test(query)||/^box\s+\S+/i.test(query))lookupBox(query);else searchContents(query);});
$('unpacking-search').addEventListener('submit',event=>{event.preventDefault();const query=$('unpacking-query').value.trim();if(query)searchContents(query,{speak:false});});
$('item-form').addEventListener('submit',submitItem);
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$('item-dialog').close()));
function handleInventoryAction(event){const edit=event.target.dataset.edit,del=event.target.dataset.delete;if(edit!==undefined)openEditor(inventory[Number(edit)],Number(edit));if(del!==undefined&&confirm(`Delete ${inventory[Number(del)].id}?`)){inventory.splice(Number(del),1);saveInventory();}}
$('inventory-rows').addEventListener('click',handleInventoryAction);
$('inventory-cards').addEventListener('click',handleInventoryAction);
$('export-button').addEventListener('click',exportCSV);
$('directory-button').addEventListener('click',openDirectoryDialog);
$('directory-manage').addEventListener('click',openDirectoryDialog);
$('directory-sync').addEventListener('click',downloadDirectory);
$('directory-form').addEventListener('submit',event=>event.preventDefault());
document.querySelectorAll('[data-directory-close]').forEach(button=>button.addEventListener('click',()=>$('directory-dialog').close()));
$('directory-download').addEventListener('click',async()=>{try{storeDirectoryConfig($('directory-url').value,$('directory-key').value);await downloadDirectory();}catch(error){$('directory-feedback').textContent=error.message;}});
$('directory-upload').addEventListener('click',()=>{try{storeDirectoryConfig($('directory-url').value,$('directory-key').value);uploadDirectory(inventory.slice());}catch(error){$('directory-feedback').textContent=error.message;}});
$('directory-disconnect').addEventListener('click',()=>{directoryConfig=null;localStorage.removeItem(DIRECTORY_KEY);directoryUI();$('directory-dialog').close();$('inventory-hint').textContent='Packing saves new boxes here. Import a CSV to load an inventory; Save CSV exports the current table.';});
$('import-file').addEventListener('change',event=>{if(event.target.files[0])importCSV(event.target.files[0]);event.target.value='';});
$('voice-select').addEventListener('change',()=>localStorage.setItem(VOICE_KEY,$('voice-select').value));
$('voice-test').addEventListener('click',()=>speakingText('Voice check. Box 12 goes to the upstairs bedroom. Fragile, please.'));
if('speechSynthesis'in window){refreshVoiceOptions();window.speechSynthesis.addEventListener('voiceschanged',refreshVoiceOptions);}
window.addEventListener('online',()=>{$('offline-label').textContent='Online · saved on this device';});
window.addEventListener('offline',()=>{$('offline-label').textContent='Ready offline';});
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
updateModeUI();renderInventory();directoryUI();
