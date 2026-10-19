import {isWin,waitsFor,roles,winGroups,tiles,shuffle} from './shared.js';
// P2P試作: 親機がすべての牌と判定を管理。対戦相手に送る状態には非公開牌を含めない。
export function createHostGame(emit, hostName, code){
 const room={code:String(code),players:[{name:hostName||'プレイヤー1'},{name:'プレイヤー2'}],stage:'waiting',round:1,points:[0,0],turn:0,phase:'waiting',ready:[false,false]};
const furitenFor=(room,i)=>{if(room.stage!=='playing'||room.hands?.[i]?.length!==7)return false;const waits=waitsFor(room.hands[i]);return waits.length>0&&waits.some(t=>room.rivers[i].includes(t));};
const broadcast=(room)=>room.players.forEach((p,i)=>{emit(i,{type:'state',room:room.code,seat:i,stage:room.stage,round:room.round,points:room.points,hand:room.hands?.[i]||[],opponentCount:room.hands?.[1-i]?.length||0,rivers:room.rivers||[[],[]],riichi:room.riichi||[false,false],riichiMarks:room.riichiMarks||[null,null],deckRemaining:room.deck?.length||0,turn:room.turn,phase:room.phase,drawn:room.drawn,discard:room.discard||null,finish:room.finish||null,waiting:room.players.length<2,furiten:furitenFor(room,i),names:room.players.map(x=>x.name)});});
function newRound(room){room.stage='playing';room.deck=shuffle(tiles());room.hands=[[],[]];room.rivers=[[],[]];room.riichi=[false,false];room.double=[false,false];room.ippatsu=[false,false];room.riichiMarks=[null,null];room.riichiTurns=[null,null];room.lastDraw=[null,null];room.discard=null;room.finish=null;for(let i=0;i<7;i++)for(let p=0;p<2;p++)room.hands[p].push(room.deck.pop());room.hands.forEach(h=>h.sort());room.turn=(room.round-1)%2;room.phase='draw';room.drawn=false;broadcast(room);}
function endRound(room,winner,kind,winTile){const full=room.hands[winner].slice();if(kind==='ロン')full.push(winTile);const bonuses=roles(full,kind,winTile);const base=kind==='ロン'?3:2;const riichi=room.riichi[winner]?2:0;const ippatsu=riichi&&room.ippatsu[winner]?1:0;const double=riichi&&room.double[winner]?1:0;const opponentRiichiBonus=room.riichi[1-winner]?1:0;const earned=base+bonuses.reduce((a,b)=>a+b.pt,0)+riichi+ippatsu+double+opponentRiichiBonus;room.points[winner]+=earned;room.stage='ended';room.phase='ended';room.finish={winner,kind,hand:full,groups:winGroups(full),winTile,base,bonuses,riichi,ippatsu,double,opponentRiichiBonus,earned,matchOver:room.points[winner]>=20};broadcast(room);}
function drawRound(room){room.stage='ended';room.phase='ended';room.finish={winner:null,kind:'流局',hand:[],bonuses:[],earned:0,matchOver:false};broadcast(room);}
function tryRon(room,discarder,t){const p=1-discarder;if(!isWin([...room.hands[p],t]))return false;const waits=waitsFor(room.hands[p]);if(waits.some(x=>room.rivers[p].includes(x)))return false;room.turn=p;room.phase='ron';room.discard={tile:t,by:discarder};broadcast(room);return true;}
function advance(room,discarder,t){if(tryRon(room,discarder,t))return;room.discard={tile:t,by:discarder};if(room.deck.length===0){drawRound(room);return;}room.turn=1-discarder;room.phase='draw';room.drawn=false;broadcast(room);}
function act(room,seat,msg){if(room.stage!=='playing')return '対局中ではありません';const hand=room.hands[seat];if(msg.action==='draw'){
 if(room.turn!==seat||room.phase!=='draw')return '今は引けません';if(!room.deck.length){drawRound(room);return;}
 const t=room.deck.pop();hand.push(t);room.lastDraw[seat]=t;room.drawn=true;room.phase='discard';if(isWin(hand)){endRound(room,seat,'ツモ',t);return;}broadcast(room);return;
 }
 if(msg.action==='riichi'){
 if(room.turn!==seat||room.riichi[seat])return '今はリーチできません';
 if(room.phase==='draw'){
  if(!waitsFor(hand).length)return 'テンパイしていません';room.riichi[seat]=true;room.double[seat]=room.rivers[seat].length===0;room.ippatsu[seat]=true;room.points[seat]--;broadcast(room);return;
 }
 if(room.phase!=='discard'||!Number.isInteger(msg.index)||msg.index<0||msg.index>=hand.length)return '捨てる牌を選んでください';
 const rest=hand.filter((_,i)=>i!==msg.index);if(!waitsFor(rest).length)return 'この牌ではテンパイしません';
 room.riichi[seat]=true;room.double[seat]=room.rivers[seat].length===0;room.ippatsu[seat]=true;room.points[seat]--;
 return discard(room,seat,msg.index,true);
 }
 if(msg.action==='discard')return discard(room,seat,msg.index);
 if(msg.action==='ron'){
 if(room.phase!=='ron'||room.turn!==seat||!room.discard)return 'ロンできません';endRound(room,seat,'ロン',room.discard.tile);return;
 }
 if(msg.action==='pass'){
 if(room.phase!=='ron'||room.turn!==seat)return '見送りできません';const d=room.discard;room.discard=null;room.ippatsu[seat]=false;if(room.deck.length===0){drawRound(room);return;}room.turn=seat;room.phase='draw';room.drawn=false;broadcast(room);return;
 }
 return '不明な操作です';
}
function discard(room,seat,index,declaring=false){const hand=room.hands[seat];if(room.turn!==seat||room.phase!=='discard'||!Number.isInteger(index)||index<0||index>=hand.length)return '捨てられません';if(room.riichi[seat]&&!declaring&&index!==hand.length-1)return 'リーチ後はツモ切りのみ';const t=hand.splice(index,1)[0];room.rivers[seat].push(t);if(room.riichi[seat]&&room.riichiMarks[seat]===null)room.riichiMarks[seat]=room.rivers[seat].length-1;
 if(room.riichi[seat]&&room.riichiMarks[seat]!==room.rivers[seat].length-1)room.ippatsu[seat]=false;
 hand.sort();room.drawn=false;room.lastDraw[seat]=null;advance(room,seat,t);
}

 function start(name){room.players[1].name=String(name||'プレイヤー2').slice(0,16);newRound(room);}
 function message(seat,msg){
  if(!msg || typeof msg!=='object')return;
  if(msg.type==='action'){const err=act(room,seat,msg);if(err)emit(seat,{type:'error',message:err});return;}
  if(msg.type==='next'&&room.stage==='ended'&&!room.finish?.matchOver){room.ready[seat]=true;emit(seat,{type:'notice',message:'相手を待っています'});if(room.ready.every(Boolean)){room.ready=[false,false];room.round++;newRound(room);}return;}
  if(msg.type==='rematch'&&room.stage==='ended'&&room.finish?.matchOver){room.ready[seat]=true;if(room.ready.every(Boolean)){room.ready=[false,false];room.points=[0,0];room.round=1;newRound(room);}return;}
 }
 return {start,message};
}
