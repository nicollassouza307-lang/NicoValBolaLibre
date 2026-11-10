'use strict';

(function attachLineupUi(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NVBLineupUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLineupUi() {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function safeId(value) {
    const id = Number(value || 0);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
  }

  function playerPhotoUrl(playerOrId) {
    if (playerOrId && typeof playerOrId === 'object' && typeof playerOrId.photoUrl === 'string') {
      try {
        const custom = new URL(playerOrId.photoUrl);
        if (custom.protocol === 'https:' && ['imagecache.365scores.com', 'media.api-sports.io'].includes(custom.hostname)) return custom.toString();
      } catch {}
    }
    const id = safeId(typeof playerOrId === 'object' ? playerOrId?.id : playerOrId);
    return id ? `https://media.api-sports.io/football/players/${id}.png` : '';
  }

  function initials(name) {
    const words = String(name || 'Jogador').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return 'JV';
    return (words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[words.length - 1][0]}`).toUpperCase();
  }

  function formationCounts(formation) {
    const match=String(formation||'').match(/(?:^|\s)(\d+(?:-\d+){1,4})(?:\s|$)/);
    if(!match)return [];
    const counts=match[1].split('-').map(Number);
    return counts.length>=2&&counts.length<=5&&counts.every(n=>Number.isInteger(n)&&n>0&&n<=6)?counts:[];
  }

  function roleForPlayer(player) {
    const record=player?.player&&typeof player.player==='object'?player.player:player;
    const positionObject=record?.position&&typeof record.position==='object'?record.position:{};
    const rawPosition=typeof record?.position==='string'?record.position:'';
    const raw=String(record?.role||record?.positionName||rawPosition||positionObject.name||positionObject.displayName||positionObject.shortName||'').toLowerCase();
    const pos=String(record?.pos||record?.positionCode||positionObject.code||positionObject.shortName||positionObject.name||'').trim().toUpperCase();
    // Prioriza a sigla tática já normalizada. O texto longo pode ser um rótulo
    // genérico do perfil e contradizer a posição específica da escalação.
    if(/^(?:G|GK|GKP|KEEPER|GOALKEEPER)$/.test(pos))return 'G';
    if(/^(?:D|DF|DEF|CB|LCB|RCB|LB|RB|LWB|RWB|FB|WB|SW)$/.test(pos))return 'D';
    if(/^(?:F|FW|ST|CF|LW|RW|LF|RF|W|ATT|SS)$/.test(pos))return 'F';
    if(/^(?:M|MF|CM|LCM|RCM|CDM|DM|CAM|AM|LAM|RAM|LM|RM)$/.test(pos))return 'M';
    if(/goalkeeper|goleir|keeper/.test(raw))return 'G';
    if(/defen|zague|lateral|centre back|center back|full back|wing back/.test(raw))return 'D';
    if(/forward|striker|winger|atacante|ponta|extremo/.test(raw))return 'F';
    if(/midfield|meio|volante|meia/.test(raw))return 'M';
    return 'U';
  }

  function distributeFormationRows(players, formation) {
    const counts=formationCounts(formation);
    let goalkeepers=players.filter(player=>roleForPlayer(player)==='G');
    let outfield=players.filter(player=>roleForPlayer(player)!=='G');
    // Some feeds omit every position code but still provide a valid 11-player
    // starting XI and formation. In that case, infer only the keeper from the
    // first row/grid line and distribute the remaining ten by formation counts.
    if(counts.length&&goalkeepers.length===0&&players.length===counts.reduce((sum,n)=>sum+n,0)+1){
      const keeperIndex=players.findIndex(player=>{
        const record=player?.player&&typeof player.player==='object'?player.player:player;
        const grid=String(record?.grid||player?.grid||'').match(/^(\d+)\s*:/);
        return Boolean(grid&&Number(grid[1])===1);
      });
      const inferredKeeper=players[keeperIndex>=0?keeperIndex:0];
      goalkeepers=[inferredKeeper];
      outfield=players.filter(player=>player!==inferredKeeper);
    }
    const rows=[];
    if(counts.length&&counts.reduce((sum,n)=>sum+n,0)===outfield.length){
      const defenders=outfield.filter(player=>roleForPlayer(player)==='D');
      const attackers=outfield.filter(player=>roleForPlayer(player)==='F');
      const midfielders=outfield.filter(player=>roleForPlayer(player)==='M');
      const unknown=outfield.filter(player=>roleForPlayer(player)==='U');
      const assigned=counts.map(()=>[]);
      const take=(source,count)=>source.splice(0,Math.max(0,count));
      assigned[0].push(...take(defenders,counts[0]));
      if(counts.length>1)assigned[counts.length-1].push(...take(attackers,counts[counts.length-1]));
      const middleIndexes=counts.map((_,i)=>i).filter(i=>i>0&&i<counts.length-1);
      middleIndexes.forEach(index=>assigned[index].push(...take(midfielders,counts[index])));
      // If a source uses broad position codes only (e.g. all five midfielders as M),
      // keep the API order while splitting the midfield across its formation lines.
      for(const index of middleIndexes){
        const free=counts[index]-assigned[index].length;
        if(free>0)assigned[index].push(...take(unknown,free),...take(midfielders,free));
      }
      if(counts.length===2){
        assigned[1].push(...take(midfielders,counts[1]-assigned[1].length),...take(unknown,counts[1]-assigned[1].length));
      }
      // Fill remaining places by role, not simply in API order. This prevents
      // a surplus winger from being dropped into the defensive line (and vice versa).
      const used=new Set(assigned.flat());
      const leftovers=outfield.filter(player=>!used.has(player));
      const available=index=>index>=0&&index<counts.length&&assigned[index].length<counts[index];
      for(const player of leftovers){
        const role=roleForPlayer(player);
        const middle=counts.map((_,index)=>index).filter(index=>index>0&&index<counts.length-1);
        let preference=[];
        if(role==='F')preference=[...middle.slice().reverse(),counts.length-1,...middle];
        else if(role==='D')preference=[0,...middle];
        else preference=middle.slice().sort((a,b)=>(assigned[a].length/counts[a])-(assigned[b].length/counts[b]));
        if(!preference.length)preference=counts.map((_,index)=>index);
        const target=preference.find(available) ?? counts.findIndex((_,index)=>available(index));
        if(target>=0)assigned[target].push(player);
      }
      rows.push(...assigned);
    } else {
      const defenders=outfield.filter(player=>roleForPlayer(player)==='D');
      const midfielders=outfield.filter(player=>roleForPlayer(player)==='M');
      const attackers=outfield.filter(player=>roleForPlayer(player)==='F');
      const unknown=outfield.filter(player=>roleForPlayer(player)==='U');
      const middleCount=Math.max(0,outfield.length-defenders.length-attackers.length);
      const desiredMiddleRows=Math.max(1,counts.length-2);
      const middleRows=Array.from({length:desiredMiddleRows},()=>[]);
      const middle=midfielders.concat(unknown);
      middle.forEach((player,index)=>middleRows[Math.min(middleRows.length-1,Math.floor(index*middleRows.length/Math.max(1,middle.length)))].push(player));
      // When the supplied formation is incomplete, prefer actual player roles over
      // forcing the declared but incomplete row counts (e.g. 4-1-1 with 10 outfielders).
      rows.push(defenders.length?defenders:[]);
      rows.push(...middleRows.filter(group=>group.length));
      rows.push(attackers.length?attackers:[]);
      if(!rows.some(group=>group.length))rows.push(outfield);
      const used=new Set(rows.flat());
      for(const player of outfield.filter(item=>!used.has(item)))rows[Math.max(0,Math.floor(rows.length/2))].push(player);
      if(middleCount===0&&rows.length>2)rows.splice(1,rows.length-2);
    }
    return {goalkeepers,rows:rows.filter(group=>group.length)};
  }

  function sortLineupPlayers(players, formation = '') {
    const rows=Array.isArray(players)?players:[];
    if(!rows.length)return [];
    const explicit=rows.map((player,index)=>{
      const record=player?.player&&typeof player.player==='object'?player.player:player;
      const gridMatch=String(record?.grid||player?.grid||'').match(/^(\d+)\s*:\s*(\d+)$/);
      return {player,record,index,grid:gridMatch?{line:Number(gridMatch[1]),row:Number(gridMatch[2])}:null};
    });
    const fallback=distributeFormationRows(rows,formation);
    const assigned=new Map();
    let depth=1;
    fallback.goalkeepers.forEach(player=>assigned.set(player,depth));
    depth=2;
    fallback.rows.forEach(group=>{group.forEach(player=>assigned.set(player,depth));depth++;});
    const inferredKeeperSet=new Set(fallback.goalkeepers||[]);
    const nonKeeperGridDepths=explicit.filter(item=>roleForPlayer(item.record)!=='G'&&item.grid&&item.grid.line>=1&&item.grid.line<=6).map(item=>item.grid.line+1).sort((a,b)=>a-b);
    const uniqueDepths=[...new Set(nonKeeperGridDepths)];
    const firstGridDepth=uniqueDepths[0],lastGridDepth=uniqueDepths[uniqueDepths.length-1];
    const hasForward=explicit.some(item=>roleForPlayer(item.record)==='F');
    // Algumas respostas da fonte trazem a coordenada visual invertida ou stale.
    // Quando um atacante aparece na linha mais recuada, ou um defensor na última,
    // reconstruímos a profundidade pelas funções e pela formação, sem trocar atletas.
    const roleGridConflict=uniqueDepths.length>=3&&explicit.some(item=>{
      if(!item.grid||roleForPlayer(item.record)==='G')return false;
      const depthValue=item.grid.line+1,role=roleForPlayer(item.record);
      return (role==='F'&&depthValue===firstGridDepth)||(role==='D'&&depthValue===lastGridDepth)||(role==='M'&&hasForward&&depthValue===lastGridDepth);
    })&&fallback.rows.length>=2;
    return explicit.map(item=>{
      const keeper=roleForPlayer(item.record)==='G'||inferredKeeperSet.has(item.player);
      // O feed pode numerar goleiro e zaga na mesma linha (1:1). Separe
      // explicitamente o goleiro e desloque todas as linhas de jogadores de linha.
      const explicitDepth=item.grid&&item.grid.line>=1&&item.grid.line<=6?item.grid.line:null;
      const depthValue=keeper?1:(roleGridConflict?(assigned.get(item.player)||2):(explicitDepth!==null?explicitDepth+1:(assigned.get(item.player)||2)));
      return {...item.player,__player:item.record,__index:item.index,__depth:depthValue,__row:roleGridConflict?null:(item.grid&&item.grid.row>=1&&item.grid.row<=8?item.grid.row:null),__isKeeper:keeper};
    }).sort((a,b)=>a.__depth-b.__depth||(a.__row??Number.MAX_SAFE_INTEGER)-(b.__row??Number.MAX_SAFE_INTEGER)||a.__index-b.__index);
  }

  function playerPlacements(players, side = 'home', formation = '') {
    const ordered=sortLineupPlayers(players,formation);
    if(!ordered.length)return [];
    const byDepth=new Map();
    for(const player of ordered){if(!byDepth.has(player.__depth))byDepth.set(player.__depth,[]);byDepth.get(player.__depth).push(player);}
    const depthKeys=[...byDepth.keys()].sort((a,b)=>a-b);
    const nonKeeperDepths=depthKeys.filter(depth=>!byDepth.get(depth).every(player=>player.__isKeeper||roleForPlayer(player)==='G'));
    // Campo horizontal com a mesma lógica da referência: goleiro recuado,
    // zaga separada e as linhas seguintes distribuídas até a zona de ataque.
    const rowX=new Map(nonKeeperDepths.map((depth,index)=>[depth,nonKeeperDepths.length===1?28:28+(index/(nonKeeperDepths.length-1))*60]));
    const lanePresets={1:[50],2:[35,65],3:[20,50,80],4:[12,37,63,88],5:[8,29,50,71,92]};
    const positions=[];
    for(const depth of depthKeys){
      const group=byDepth.get(depth),count=group.length;
      const preset=lanePresets[count]||group.map((_,index)=>count===1?50:8+(index/(count-1))*84);
      const rows=group.map(player=>player.__row).filter(Number.isFinite);
      const maxRow=rows.length?Math.max(...rows):0;
      group.forEach((player,index)=>{
        const lane=Number.isFinite(player.__row)&&maxRow>1?15+((player.__row-1)/(maxRow-1))*70:preset[index];
        const isKeeper=Boolean(player.__isKeeper)||roleForPlayer(player)==='G';
        let xForward=isKeeper?8.5:(rowX.get(depth)||28);
        const raw=String(player.__player?.role||player.__player?.position||'').toLowerCase();
        if(!isKeeper&&/wing|ponta|wide|lateral/.test(raw))xForward+=1.5;
        xForward=Math.max(8.5,Math.min(80,xForward));
        positions.push({player,left:Number((side==='away'?100-xForward:xForward).toFixed(2)),top:Number(lane.toFixed(2)),depth:Number(xForward.toFixed(2))});
      });
    }
    return positions;
  }

  function resolveLineups(snapshot) {
    const rows = Array.isArray(snapshot?.lineups) ? snapshot.lineups.slice(0, 2) : [];
    const homeId = safeId(snapshot?.fixture?.home?.id);
    const awayId = safeId(snapshot?.fixture?.away?.id);
    const homeName = String(snapshot?.fixture?.home?.name || snapshot?.home || '').trim().toLowerCase();
    const awayName = String(snapshot?.fixture?.away?.name || snapshot?.away || '').trim().toLowerCase();
    const used = new Set();
    function take(id, name, fallbackIndex) {
      let index = rows.findIndex((row, rowIndex) => !used.has(rowIndex) && id && safeId(row?.team?.id) === id);
      if (index < 0 && name) index = rows.findIndex((row, rowIndex) => !used.has(rowIndex) && String(row?.team?.name || '').trim().toLowerCase() === name);
      if (index < 0 && rows[fallbackIndex] && !used.has(fallbackIndex)) index = fallbackIndex;
      if (index >= 0) { used.add(index); return rows[index]; }
      return null;
    }
    return [take(homeId, homeName, 0), take(awayId, awayName, 1)];
  }

  function renderPhoto(player, compact = false) {
    const record = player?.player && typeof player.player === 'object' ? player.player : player;
    const id = safeId(record?.id);
    const name = String(record?.name || 'Jogador');
    const photo = playerPhotoUrl(record);
    const number = record?.number === null || record?.number === undefined || record?.number === '' ? '—' : String(record.number);
    return `<div class="apifootball-photo-frame${photo ? '' : ' is-fallback'}" aria-hidden="true">${photo ? `<img class="apifootball-player-photo" data-apifootball-player-photo src="${photo}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}<span class="apifootball-photo-fallback">${escapeHtml(initials(name))}</span></div>`;
  }

  function safePngUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' && /\.(?:png|webp|jpe?g)(?:$|\?)/i.test(url.href) ? url.toString() : '';
    } catch { return ''; }
  }

  function renderPlayerEventSymbol(item, eventIcons = {}) {
    const custom = safePngUrl(eventIcons?.[item.kind] || (item.kind === 'own-goal' ? eventIcons?.goal : ''));
    if (custom) return `<img class="nvb-player-event-image" src="${escapeHtml(custom)}" alt="" loading="lazy" decoding="async">`;
    return `<span class="nvb-player-event-emoji" aria-hidden="true">${escapeHtml(item.icon || '•')}</span>`;
  }

  function statValueParts(stat) {
    const raw=stat?.value??stat?.displayValue??stat?.numericValue??stat?.successValue??'';
    if(typeof raw==='number'&&Number.isFinite(raw))return {value:raw,success:Number.isFinite(Number(stat?.successValue))?Number(stat.successValue):raw,attempts:Number.isFinite(Number(stat?.attemptsValue))?Number(stat.attemptsValue):null,percent:Number.isFinite(Number(stat?.percentageValue))?Number(stat.percentageValue):null};
    const text=String(raw).trim().replace(/,/g,'.');
    const ratio=text.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)(?:\s*\(\s*(-?\d+(?:\.\d+)?)\s*%\s*\))?/);
    if(ratio){const success=Number(ratio[1]),attempts=Number(ratio[2]);const percent=ratio[3]!==undefined?Number(ratio[3]):(attempts>0?success/attempts*100:null);return {value:success,success,attempts,percent:Number.isFinite(percent)?percent:null};}
    const numeric=Number(text.replace('%',''));
    if(Number.isFinite(numeric)&&text!=='')return {value:numeric,success:numeric,attempts:null,percent:/%/.test(text)?numeric:null};
    return {value:null,success:null,attempts:null,percent:null};
  }

  function playerRatingInfo(player) {
    const record=player?.player&&typeof player.player==='object'?player.player:player||{};
    const stats=Array.isArray(record.stats)?record.stats:[];
    const events=Array.isArray(record.events)?record.events.filter(item=>!item?.isPenaltyShootout&&item?.eventGroup!=='penalty-shootout') : [];
    const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const normalized=stats.map(stat=>({name:fold(stat?.name||stat?.typeName||stat?.label),...statValueParts(stat)}));
    const officialRaw=record.rating??normalized.find(item=>/^(?:rating|nota|performance score|player rating|fotmob rating)$/.test(item.name))?.value;
    const official=Number(officialRaw);
    const hasPerformanceStats=normalized.some(item=>!/(?:minutes played|minutos|minutos jogados|rating|nota|performance score|player rating|fotmob rating)/.test(item.name)&&Number.isFinite(item.value));
    if(!hasPerformanceStats&&!events.length){
      if(officialRaw!==null&&officialRaw!==undefined&&officialRaw!==''&&Number.isFinite(official))return {value:Math.max(0,Math.min(10,official)),source:'Nota oficial da fonte'};
      return {value:null,source:'sem estatísticas individuais'};
    }
    const role=roleForPlayer(record);
    const sum=(pattern,field='value')=>normalized.reduce((total,item)=>pattern.test(item.name)&&Number.isFinite(item[field])?total+Math.max(0,item[field]):total,0);
    const first=(pattern,field='value')=>normalized.find(item=>pattern.test(item.name)&&Number.isFinite(item[field]))?.[field]??0;
    const capped=(value,cap)=>Math.max(0,Math.min(cap,value));
    const ratioBonus=(pattern,base,scale,cap)=>{const matched=normalized.find(item=>pattern.test(item.name)&&Number.isFinite(item.percent));if(!matched)return 0;return Math.max(-.2,Math.min(cap,(matched.percent-base)*scale));};
    const kinds=events.map(item=>fold(item.kind||item.type||item.label));
    const attackWeight=role==='F'?1:role==='M'?.82:role==='D'?.5:.16;
    const defenseWeight=role==='D'?1:role==='M'?.82:role==='F'?.42:.65;
    let score=6;

    // Gols/assistências recebidos nas estatísticas têm prioridade sobre eventos,
    // para que o mesmo lance nunca seja contado duas vezes.
    const goalStat=normalized.find(item=>/^(?:goals?|gols?)$/.test(item.name)&&Number.isFinite(item.value));
    const assistStat=normalized.find(item=>/^(?:assists?|assistencias?)$/.test(item.name)&&Number.isFinite(item.value));
    const goals=goalStat?Math.max(0,goalStat.value):kinds.filter(kind=>/^(?:goal|gol)$/.test(kind)).length;
    const assists=assistStat?Math.max(0,assistStat.value):kinds.filter(kind=>/^(?:assist|assistencia)$/.test(kind)).length;
    score+=attackWeight*(capped(goals*.95,1.9)+capped(assists*.68,1.36));
    score-=capped(kinds.filter(kind=>/own goal|gol contra/.test(kind)).length*1.1,2.2);
    score-=capped(kinds.filter(kind=>/double yellow|duplo amarelo|segundo amarelo/.test(kind)).length*.8,1.6);
    score-=capped(kinds.filter(kind=>/yellow|amarelo/.test(kind)).length*.2,.6);
    score-=capped(kinds.filter(kind=>/red|vermelho/.test(kind)).length*1.45,2.2);
    score-=capped(kinds.filter(kind=>/missed penalty|penalti perdido/.test(kind)).length*.45,.9);

    // Ataque e criação: cada métrica recebida é considerada, com retornos
    // decrescentes para volume alto e peso ajustado à função do atleta.
    score+=attackWeight*capped(sum(/expected assists|assistencia esperada|\bxa\b/)*.38,.62);
    score+=attackWeight*capped(sum(/expected goals on target|gols esperados no alvo|gols esperados em chutes no alvo|expected goals in shots on target|\bxgot\b/)*.2,.48);
    score+=attackWeight*capped(sum(/expected goals|gols esperados|\bxg\b/)*.25,.68);
    score+=attackWeight*capped(sum(/big chances (?:converted|scored)|grandes chances convertidas|grande chance convertida/)*.24,.48);
    score+=attackWeight*capped(sum(/key passes|passes decisivos|pases clave/)*.105,.63);
    score+=attackWeight*capped(sum(/chances created|chances perigosas criadas|oportunidades criadas|chances criadas/)*.075,.38);
    score+=attackWeight*capped(sum(/shots on target|chutes no gol|chutes a gol|finalizacoes no gol|remates a puerta/)*.12,.6);
    score+=attackWeight*capped(sum(/^(?:total shots|shots|chutes|total de chutes|finalizacoes)$/)*.025,.25);
    score-=attackWeight*capped(sum(/shots off target|shots wide|chutes para fora|finalizacoes para fora|remates desviados/)*.025,.2);
    score+=attackWeight*capped(sum(/successful dribbles|dribbles completed|dribles completos|dribles certos|dribles bem sucedidos/)*.09,.45);
    score+=attackWeight*capped(sum(/crosses completed|cruzamentos completos|centros completados/)*.035,.18);
    score+=attackWeight*capped(sum(/passes in final third|passes no ultimo terco|passes no terco final/)*.012,.38);
    score+=attackWeight*capped(sum(/long passes completed|passes longos completos|pases largos completados/)*.028,.2);
    score+=attackWeight*capped(sum(/passes completed|passes completos|pases completados/)*.0028,.24);
    score+=attackWeight*capped(sum(/backward passes|passes para tras|passes atras/)*.002,.06);
    score+=attackWeight*capped(sum(/ball actions|actions with the ball|acoes com a bola|toques na bola/)*.0018,.2);
    score+=attackWeight*ratioBonus(/^(?:passes completed|passes completos|pases completados)$/,70,.008,.22);
    score+=attackWeight*ratioBonus(/long passes completed|passes longos completos|pases largos completados/,55,.006,.16);
    score+=attackWeight*ratioBonus(/crosses completed|cruzamentos completos|centros completados/,30,.004,.14);

    // Posse, duelos, recuperação e defesa. Passes para trás contam com peso
    // quase neutro: são uma decisão tática, não um erro por si só.
    score+=capped(sum(/fouls suffered|faltas sofridas|faltas recebidas/)*.035,.2);
    score-=capped(sum(/fouls committed|faltas cometidas/)*.07,.42);
    score-=capped(sum(/possession lost|lost possession|posse de bola perdida|posse perdida|perdas de posse/)*.03,.55);
    score-=capped(sum(/times dribbled past|dribbled past|driblado|driblado por/)*.09,.45);
    score-=attackWeight*capped(sum(/offsides|impedimentos|fuera de juego/)*.045,.2);
    score+=defenseWeight*capped(sum(/^(?:tackles|desarmes|entradas bem sucedidas)$/)*.085,.65);
    score+=defenseWeight*capped(sum(/interceptions|interceptacoes/)*.08,.58);
    score+=defenseWeight*capped(sum(/^(?:clearances|danger cleared|perigo afastado|cortes|corte)$/)*.05,.48);
    score+=defenseWeight*capped(sum(/^(?:recoveries|ball recoveries|recuperacao de posse de bola|recuperacoes|posse recuperada)$/)*.05,.42);
    score+=defenseWeight*capped(sum(/recoveries in final third|final third recoveries|posse recuperada no terco final|recuperacoes no terco final/)*.12,.42);
    score+=defenseWeight*capped(sum(/blocks|blocked shots|bloqueios|chutes bloqueados/)*.08,.36);
    score+=defenseWeight*capped(sum(/clearance attempts|cortes tentados|aerial clearances/)*.025,.18);
    score+=defenseWeight*capped(sum(/successful tackles|desarmes certos|tackles won/)*.035,.2);
    score+=defenseWeight*capped(sum(/possession won|ball won|bolas recuperadas|disputas ganhas/)*.035,.24);
    score-=capped(sum(/errors leading to goal|erro que gerou gol|erros que resultaram em gol/)*.9,1.8);
    score-=capped(sum(/errors leading to shot|errors leading to chance|erro que originou finalizacao|erro que gerou chute/)*.16,.48);

    for(const item of normalized.filter(entry=>/ground duels|duelos no chao|duelos terrestres|aerial duels|duelos aereos|duelos por cima|duelos por arriba/.test(entry.name))){
      if(Number.isFinite(item.success))score+=defenseWeight*capped(item.success*.014,.24);
      if(Number.isFinite(item.percent))score+=defenseWeight*Math.max(-.12,Math.min(.2,(item.percent-50)*.004));
    }

    if(role==='G'){
      score+=capped(sum(/saves|defesas do goleiro|defesas realizadas|goalkeeper saves/)*.13,1.3);
      score+=capped(sum(/punches|reposicao de soco|socos/)*.055,.33);
      score+=capped(sum(/sweeper actions|atuou como libero|acoes de libero|libero/)*.08,.24);
      score+=capped(sum(/goals prevented|gols evitados|expected goals prevented/)*.2,.6);
      score+=ratioBonus(/save percentage|percentual de defesas|defesas percentuais/,65,.008,.28);
      score-=capped(sum(/goals conceded|gols sofridos|goles recibidos/)*.18,1.08);
      score+=capped(sum(/penalties saved|penaltis defendidos/)*.7,.7);
    }

    const minutes=first(/minutes played|minutos|minutos jogados/);
    const participation=minutes>0?Math.max(.35,Math.min(1,minutes/65)):1;
    score=6+(score-6)*participation;
    return {value:Number(Math.max(0,Math.min(10,score)).toFixed(1)),source:'nota estimada com estatísticas individuais disponíveis, eventos, função e minutos'};
  }

  function renderPlayerRatings(lineups) {
    const teams=(Array.isArray(lineups)?lineups:[]).filter(Boolean).map(lineup=>{
      const rows=(Array.isArray(lineup.startXI)?lineup.startXI:[]).concat(Array.isArray(lineup.substitutes)?lineup.substitutes:[]).map(item=>{
        const player=item?.player&&typeof item.player==='object'?item.player:item;
        return {player,info:playerRatingInfo(player)};
      });
      return `<section class="apifootball-rating-team"><h5>${escapeHtml(lineup.team?.name||'Equipe')}</h5><div class="apifootball-rating-table-wrap"><table class="apifootball-rating-table"><thead><tr><th>Jogador</th><th>Eventos/dados</th><th>Nota</th></tr></thead><tbody>${rows.map(({player,info})=>{
        const summary=(player.events||[]).map(item=>item.label||item.kind).filter(Boolean);
        const evidence=summary.length?summary.join(' · '):(player.stats||[]).slice(0,3).map(item=>`${item.name}: ${item.value}`).join(' · ');
        return `<tr><td>${escapeHtml(player.name||'Jogador')}</td><td>${escapeHtml(evidence||'Sem estatísticas individuais recebidas')}</td><td><strong title="${escapeHtml(info.source)}">${info.value===null?'—':info.value.toFixed(1)}</strong></td></tr>`;
      }).join('')}</tbody></table></div></section>`;
    });
    return teams.length?`<section class="apifootball-player-ratings"><div class="apifootball-section-title">Notas dos jogadores</div><p class="apifootball-muted">Escala de 0 a 10. A estimativa considera as estatísticas individuais disponíveis, eventos, posição e minutos. A nota oficial da fonte é usada apenas quando faltam dados individuais. Sem dados suficientes, exibimos —.</p><div class="apifootball-rating-grid">${teams.join('')}</div></section>`:'';
  }

  function renderPitchPlayer(entry, eventIcons = {}) {
    const player = entry.__player || (entry.player?.player && typeof entry.player.player === 'object' ? entry.player.player : entry.player) || {};
    const name = String(player.name || 'Jogador');
    const number = player.number === null || player.number === undefined || player.number === '' ? '—' : String(player.number);
    const label = `${name}, camisa ${number}`;
    const events=Array.isArray(player.events)?player.events:[];
    const left=events.filter(item=>['yellow','red','double-yellow','substitution','missed-penalty'].includes(item.kind));
    const right=events.filter(item=>['goal','own-goal','assist'].includes(item.kind));
    const badges=(items,side)=>{
      const output=[];
      for(const kind of ['goal','own-goal','assist']){
        const grouped=items.filter(item=>item.kind===kind);
        if(!grouped.length)continue;
        const title=grouped.map(item=>`${item.label||kind}${item.minute?` · ${item.minute}`:''}`).join(' | ');
        output.push(`<span class="nvb-player-event ${side} ${kind} nvb-player-event-goal" title="${escapeHtml(title)}"><span class="nvb-player-event-symbol">${renderPlayerEventSymbol(grouped[0],eventIcons)}</span><small>${grouped.length}x</small></span>`);
      }
      for(const item of items.filter(item=>!['goal','own-goal','assist'].includes(item.kind))) {
        output.push(`<span class="nvb-player-event ${side} ${escapeHtml(item.kind)}" title="${escapeHtml(item.label||item.kind)} · ${escapeHtml(item.minute||'')}">${renderPlayerEventSymbol(item,eventIcons)}</span>`);
      }
      return output.join('');
    };
    const ratingInfo=playerRatingInfo(player);
    const ratingValue=ratingInfo.value;
    const ratingTier=ratingValue===null?'':(ratingValue>=8?'rating-excellent':ratingValue>=7?'rating-good':ratingValue>=6?'rating-average':ratingValue>=5?'rating-low':'rating-poor');
    const rating=ratingValue!==null?`<span class="apifootball-pitch-number apifootball-pitch-rating ${ratingTier}" title="${escapeHtml(ratingInfo.source)}">${ratingValue.toFixed(1)}</span>`:'';
    return `<div class="apifootball-pitch-player" style="--pitch-depth:${entry.depth ?? entry.left}%;--pitch-lane:${entry.top}%;left:${entry.left}%;top:${entry.top}%" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      <div class="nvb-player-event-rail left">${badges(left,'left')}</div><div class="nvb-player-event-rail right">${badges(right,'right')}</div>
      ${renderPhoto(player)}${rating}
      <div class="apifootball-pitch-name-row"><span class="apifootball-pitch-shirt-number apifootball-pitch-number" title="Camisa ${escapeHtml(number)}">${escapeHtml(number)}</span><span class="apifootball-pitch-name">${escapeHtml(name)}</span></div>
    </div>`;
  }

  function renderBenchPlayer(player, eventIcons = {}) {
    const record = player?.player && typeof player.player === 'object' ? player.player : player;
    const name = String(record?.name || 'Jogador');
    const number = record?.number === null || record?.number === undefined || record?.number === '' ? '—' : String(record.number);
    const ratingInfo=playerRatingInfo(record);const rating=ratingInfo.value!==null?`<span class="apifootball-bench-rating" title="${escapeHtml(ratingInfo.source)}">${ratingInfo.value.toFixed(1)}</span>`:'';
    const events=Array.isArray(record?.events)?record.events:[];
    const eventHtml=events.length?`<span class="apifootball-bench-events">${events.map(item=>`<span class="apifootball-bench-event ${escapeHtml(item.kind)}" title="${escapeHtml(item.label||item.kind)} · ${escapeHtml(item.minute||'')}">${renderPlayerEventSymbol(item,eventIcons)}</span>`).join('')}</span>`:'';
    return `<div class="apifootball-bench-player">${renderPhoto(player, true)}<div class="apifootball-bench-copy"><div class="apifootball-bench-name-row"><span class="apifootball-bench-number" title="Camisa ${escapeHtml(number)}">${escapeHtml(number)}</span><span class="apifootball-bench-name">${escapeHtml(name)}</span>${eventHtml}</div>${rating}</div></div>`;
  }

  function renderTeamHead(lineup, fixtureTeam, label) {
    const name = String(lineup?.team?.name || fixtureTeam?.name || label);
    const logo = String(fixtureTeam?.logo || '');
    const formation = String(lineup?.formation || 'Formação não informada');
    return `<div class="apifootball-pitch-team-head"><div class="apifootball-team-head-crest">${logo ? `<img src="${escapeHtml(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span>${escapeHtml(initials(name))}</span>`}</div><div class="apifootball-team-head-info"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(formation)}</small></div></div>`;
  }

  function renderSupportCard(lineup, fixtureTeam, label) {
    const name = String(lineup?.team?.name || fixtureTeam?.name || label);
    const coachData = lineup?.coach && typeof lineup.coach === 'object' ? lineup.coach : { name: lineup?.coach };
    const coach = String(coachData?.name || '').trim();
    const coachPhoto = safePhotoUrl(coachData?.photoUrl);
    const substitutes = Array.isArray(lineup?.substitutes) ? lineup.substitutes : [];
    return `<article class="apifootball-support-card">
      <div class="apifootball-support-head"><div><span class="apifootball-support-kicker">COMISSÃO TÉCNICA</span><h5>${escapeHtml(name)}</h5></div><span class="apifootball-support-count">${substitutes.length} reservas</span></div>
      ${coach?`<div class="apifootball-coach-row"><span class="apifootball-coach-photo${coachPhoto?'':' is-fallback'}">${coachPhoto?`<img src="${escapeHtml(coachPhoto)}" data-apifootball-player-photo alt="" loading="lazy" decoding="async">`:escapeHtml(initials(coach))}</span><div><small>Técnico</small><strong>${escapeHtml(coach)}</strong></div></div>`:''}
      <div class="apifootball-section-title">Banco de reservas</div>
      ${substitutes.length ? `<div class="apifootball-bench-list">${substitutes.map(player=>renderBenchPlayer(player,lineup?.eventIcons||{})).join('')}</div>` : '<div class="apifootball-lineup-empty">Reservas não informados.</div>'}
    </article>`;
  }

  function safePhotoUrl(value) {
    try { const url=new URL(String(value||'')); return url.protocol==='https:' && ['imagecache.365scores.com','media.api-sports.io'].includes(url.hostname) ? url.toString() : ''; }
    catch { return ''; }
  }

  function renderLineups(snapshot, options = {}) {
    const lineups = resolveLineups(snapshot);
    if (!lineups.some(Boolean)) return '<div class="apifootball-message">A escalação ainda não foi divulgada ou não está disponível para esta competição.</div>';
    const fixtureHome = snapshot?.fixture?.home || { name: snapshot?.home || 'Mandante' };
    const fixtureAway = snapshot?.fixture?.away || { name: snapshot?.away || 'Visitante' };
    const home = lineups[0];
    const away = lineups[1];
    const renderHalf = (lineup, side) => {
      if (!lineup) return `<div class="apifootball-pitch-half ${side} apifootball-pitch-half-empty"><div class="apifootball-half-empty-label">Escalação não disponível</div></div>`;
      const players = Array.isArray(lineup.startXI) ? lineup.startXI : [];
      const placed = playerPlacements(players, side, lineup.formation);
      return `<div class="apifootball-pitch-half ${side}">${placed.map(entry=>renderPitchPlayer(entry,options.eventIcons||{})).join('')}</div>`;
    };
    return `<div class="apifootball-lineups-view">
      <div class="apifootball-pitch-team-heads">${renderTeamHead(home, fixtureHome, 'Mandante')}${renderTeamHead(away, fixtureAway, 'Visitante')}</div>
      <div class="apifootball-pitch-scroll"><div class="apifootball-pitch" role="img" aria-label="Campo com os jogadores titulares posicionados conforme a formação">
        <div class="apifootball-pitch-outline"></div><div class="apifootball-pitch-center-line"></div><div class="apifootball-pitch-center-circle"></div><div class="apifootball-pitch-box home"></div><div class="apifootball-pitch-box away"></div>
        ${renderHalf(home, 'home')}${renderHalf(away, 'away')}
      </div></div>
      <div class="apifootball-support-grid">${renderSupportCard({...home,eventIcons:options.eventIcons||{}}, fixtureHome, 'Mandante')}${renderSupportCard({...away,eventIcons:options.eventIcons||{}}, fixtureAway, 'Visitante')}</div>
      ${renderPlayerRatings([home,away])}
      <div class="apifootball-muted apifootball-lineup-footnote">Fotos obtidas pela fonte de dados do jogador quando disponível. Quando uma foto não existe, mostramos as iniciais em vez de associar uma imagem incerta.</div>
    </div>`;
  }

  function statsRows(snapshot) {
    const teams = Array.isArray(snapshot?.statistics) ? snapshot.statistics : [];
    const homeId = safeId(snapshot?.fixture?.home?.id);
    const awayId = safeId(snapshot?.fixture?.away?.id);
    const homeTeam = teams.find(team => homeId && safeId(team?.team?.id) === homeId) || teams[0];
    const awayTeam = teams.find(team => awayId && safeId(team?.team?.id) === awayId) || teams.find(team => team !== homeTeam) || teams[1];
    const home = homeTeam?.values || [];
    const away = awayTeam?.values || [];
    const get = (arr, names) => {
      const row = arr.find(item => names.includes(String(item.type || '').toLowerCase()));
      return row?.value ?? '—';
    };
    const specs = [
      ['Posse de bola', ['ball possession']], ['Finalizações', ['total shots']], ['No gol', ['shots on goal']],
      ['Finalizações para fora', ['shots off goal']], ['Escanteios', ['corner kicks']], ['Faltas', ['fouls']],
      ['Amarelos', ['yellow cards']], ['Vermelhos', ['red cards']], ['Impedimentos', ['offsides']],
      ['Passes', ['total passes', 'passes']], ['Precisão dos passes', ['passes %', 'pass accuracy']]
    ];
    return specs.map(([label, names]) => ({ label, home: get(home, names), away: get(away, names) }))
      .filter(row => row.home !== '—' || row.away !== '—');
  }

  function numericValue(value) {
    if (value === null || value === undefined || value === '—') return null;
    const match = String(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    return match ? Math.max(0, Number(match[0])) : null;
  }

  function eventMinute(event) {
    const rawElapsed = event?.time?.elapsed;
    if (rawElapsed === null || rawElapsed === undefined || rawElapsed === '') return '—';
    const elapsed = Number(rawElapsed);
    if (!Number.isFinite(elapsed)) return '—';
    const extra = Number(event?.time?.extra);
    return `${elapsed}${Number.isFinite(extra) && extra > 0 ? `+${extra}` : ''}′`;
  }

  function eventTeamName(event, snapshot) {
    const teamId = safeId(event?.team?.id);
    const homeId = safeId(snapshot?.fixture?.home?.id);
    const awayId = safeId(snapshot?.fixture?.away?.id);
    if (teamId && teamId === homeId) return String(snapshot?.fixture?.home?.name || 'Mandante');
    if (teamId && teamId === awayId) return String(snapshot?.fixture?.away?.name || 'Visitante');
    return String(event?.team?.name || '');
  }

  function renderMatchEvents(snapshot) {
    const events = (Array.isArray(snapshot?.events) ? snapshot.events : []).filter(event => {
      const type = String(event?.type || '').toLowerCase();
      return ['goal', 'subst', 'substitution', 'card', 'var'].includes(type);
    }).slice().sort((a, b) => {
      const minuteA = Number(a?.time?.elapsed || 0) * 100 + Number(a?.time?.extra || 0);
      const minuteB = Number(b?.time?.elapsed || 0) * 100 + Number(b?.time?.extra || 0);
      return minuteA - minuteB;
    });
    const rows = events.map(event => {
      const type = String(event?.type || '').toLowerCase();
      const detail = String(event?.detail || '');
      const player = String(event?.player?.name || 'Jogador não informado');
      const assist = String(event?.assist?.name || '');
      const team = eventTeamName(event, snapshot);
      const minute = eventMinute(event);
      let icon = '⚽';
      let title = player;
      let note = '';
      let kind = 'goal';
      if (type === 'goal') {
        if (/missed penalty/i.test(detail)) { icon = '✖'; title = 'Pênalti perdido'; note = player; kind = 'missed-penalty'; }
        else if (/own goal/i.test(detail)) { icon = '⚽'; title = `Gol contra · ${player}`; kind = 'own-goal'; }
        else if (/penalty/i.test(detail)) { icon = '⚽'; title = `Gol de pênalti · ${player}`; kind = 'goal'; }
        if (assist && !/missed penalty/i.test(detail)) note = `Assistência: ${assist}`;
      } else if (type === 'subst' || type === 'substitution') {
        icon = '⇄'; kind = 'substitution';
        const incoming = assist || 'Jogador não informado';
        title = `Entrou: ${incoming}`;
        note = `Saiu: ${player}`;
      } else if (type === 'card') {
        icon = /red/i.test(detail) ? '🟥' : '🟨'; kind = 'card';
        title = /red/i.test(detail) ? 'Cartão vermelho' : 'Cartão amarelo';
        note = player;
      } else if (type === 'var') {
        icon = '📺'; kind = 'var'; title = 'Revisão do VAR'; note = detail || String(event?.comments || '');
      }
      return `<article class="apifootball-event-row ${kind}"><time>${escapeHtml(minute)}</time><span class="apifootball-event-icon" aria-hidden="true">${icon}</span><div class="apifootball-event-copy"><strong>${escapeHtml(title)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</div><span class="apifootball-event-team">${escapeHtml(team)}</span></article>`;
    }).join('');
    if (!rows) return `<section class="apifootball-events-panel"><div class="apifootball-section-title">Gols, assistências e substituições</div><div class="apifootball-lineup-empty">A API ainda não disponibilizou lances para esta partida.</div></section>`;
    return `<section class="apifootball-events-panel"><div class="apifootball-events-heading"><div><div class="apifootball-section-title">Gols, assistências e substituições</div><small>Eventos oficiais fornecidos pela API-Football</small></div>${events.length ? `<span>${events.length} lance(s)</span>` : ''}</div><div class="apifootball-event-list">${rows}</div></section>`;
  }

  const TEAM_PRIMARY_COLORS = {
    'flamengo':'#c8102e','fluminense':'#7a003c','palmeiras':'#007a33','gremio':'#00a1e4','atletico mg':'#171717','corinthians':'#171717','santos':'#181818',
    'botafogo':'#171717','atletico mineiro':'#171717','atletico-mg':'#171717','internacional':'#d71920','cruzeiro':'#005ca9','vasco':'#171717',
    'bahia':'#075ca8','bragantino':'#8c1017','red bull bragantino':'#8c1017','athletico paranaense':'#d71920','fortaleza':'#00529b','ceara':'#171717',
    'sport recife':'#d71920','vitoria':'#d71920','goias':'#007a33','coritiba':'#007a33','america mineiro':'#007a33','sao paulo':'#e32636',
    'liverpool':'#c8102e','manchester united':'#da291c','manchester city':'#6cabdd','arsenal':'#ef0107','chelsea':'#034694','tottenham':'#132257',
    'newcastle':'#171717','aston villa':'#670e36','west ham':'#7a263a','everton':'#003399','brighton':'#0057b8','crystal palace':'#1b458f',
    'real madrid':'#d4a72c','barcelona':'#a50044','atletico madrid':'#c8102e','atletico de madrid':'#c8102e','sevilla':'#d71920','valencia':'#171717',
    'bayern munich':'#dc052d','borussia dortmund':'#f7d417','bayer leverkusen':'#e32219','rb leipzig':'#dd0741','schalke 04':'#004b9b',
    'inter':'#00529f','internazionale':'#00529f','ac milan':'#fb090b','milan':'#fb090b','juventus':'#171717','napoli':'#00a0df','roma':'#8e1b2f',
    'paris saint germain':'#004170','psg':'#004170','benfica':'#d50032','porto':'#0050a4','sporting cp':'#008e44','ajax':'#d2122e',
    'celtic':'#018749','rangers':'#005eb8','borussia monchengladbach':'#171717','monaco':'#e00025','marseille':'#009fe3','lyon':'#003c8f'
  };
  function normalizeTeamColorName(name) {
    return String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }
  function teamPrimaryColor(name, fallback='#64748b') {
    const normalized=normalizeTeamColorName(name);
    if(TEAM_PRIMARY_COLORS[normalized])return TEAM_PRIMARY_COLORS[normalized];
    const alias=Object.keys(TEAM_PRIMARY_COLORS).find(key=>normalized===key || (normalized.length>5&&normalized.includes(key)) || (key.length>5&&key.includes(normalized)));
    return alias?TEAM_PRIMARY_COLORS[alias]:fallback;
  }

  function renderStatistics(snapshot) {
    const rows = statsRows(snapshot);
    if (!rows.length) return '<div class="apifootball-message">As estatísticas detalhadas ainda não estão disponíveis para esta partida. Isso pode depender da cobertura da competição ou do estágio do jogo.</div>';
    const homeName = String(snapshot?.fixture?.home?.name || snapshot?.home || 'Mandante');
    const awayName = String(snapshot?.fixture?.away?.name || snapshot?.away || 'Visitante');
    const homeColor=teamPrimaryColor(homeName,'#2563eb');
    const awayColor=teamPrimaryColor(awayName,'#dc2626');
    const list = rows.map(row => {
      const homeNumber = numericValue(row.home);
      const awayNumber = numericValue(row.away);
      const homeShare = homeNumber === null || awayNumber === null || homeNumber + awayNumber === 0
        ? 50 : Math.round((homeNumber / (homeNumber + awayNumber)) * 100);
      return `<article class="apifootball-stat-card" style="--stat-home-color:${homeColor};--stat-away-color:${awayColor}"><div class="apifootball-stat-values"><strong>${escapeHtml(row.home)}</strong><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.away)}</strong></div><div class="apifootball-stat-bar" aria-hidden="true"><span class="home" style="width:${homeShare}%"></span><span class="away" style="width:${100 - homeShare}%"></span></div></article>`;
    }).join('');
    return `<div class="apifootball-statistics-view" style="--stat-home-color:${homeColor};--stat-away-color:${awayColor}"><div class="apifootball-stat-team-labels"><strong>${escapeHtml(homeName)}</strong><strong>${escapeHtml(awayName)}</strong></div><div class="apifootball-stat-grid">${list}</div><div class="apifootball-muted">Comparativo das estatísticas fornecidas pela fonte esportiva selecionada. Um traço indica dado não informado.</div></div>`;
  }

  return { escapeHtml, playerPhotoUrl, initials, sortLineupPlayers, playerPlacements, resolveLineups, playerRatingInfo, renderPlayerRatings, renderLineups, statsRows, numericValue, normalizeTeamColorName, teamPrimaryColor, renderStatistics, eventMinute, renderMatchEvents };
});
