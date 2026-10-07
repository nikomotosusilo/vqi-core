const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();
app.use(cors());
app.use(express.json());

let chain = {
  balances: {}, // address -> VQI
  assets: {}, // address -> {BTC:10, AAPL:5}
  height: 1,
  prevHash: crypto.randomBytes(28).toString('hex'),
  history: []
};

function getBal(addr){
  if(!chain.balances[addr]) chain.balances[addr]=1000000; // bonus awal 1jt VQI
  if(!chain.assets[addr]) chain.assets[addr]={};
  return chain.balances[addr];
}

app.get('/', (req,res)=>res.send('VQI V3 REAL OK - height:'+chain.height));
app.get('/api/balance/:addr', (req,res)=>{
  let a=req.params.addr;
  res.json({balance:getBal(a), assets:chain.assets[a]||{}, height:chain.height, hash:chain.prevHash});
});

app.post('/api/mine',(req,res)=>{
  let {address} = req.body;
  let reward = 2941;
  chain.balances[address]=(chain.balances[address]||0)+reward;
  chain.height++;
  chain.prevHash=crypto.createHash('sha256').update(chain.prevHash+address+Date.now()).digest('hex');
  res.json({ok:true,message:`Block #${chain.height} mined +${reward} VQI`,newBalance:chain.balances[address],height:chain.height,hash:chain.prevHash});
});

app.post('/api/buy',(req,res)=>{
  let {address,symbol,amountUSD}=req.body;
  let need = amountUSD * 10000; // 1 USD = 10k VQI
  getBal(address);
  if(chain.balances[address] < need) return res.json({ok:false,error:`Saldo kurang. Butuh ${need} VQI, punya ${chain.balances[address]}`});
  chain.balances[address]-=need;
  chain.assets[address][symbol]=(chain.assets[address][symbol]||0)+amountUSD;
  res.json({ok:true,message:`BUY ${symbol} $${amountUSD}`,remainingVQI:chain.balances[address]});
});

app.post('/api/sell',(req,res)=>{
  let {address,symbol,amountUSD}=req.body;
  getBal(address);
  let have = chain.assets[address][symbol]||0;
  if(have < amountUSD) return res.json({ok:false,error:`Lu cuma punya ${symbol} $${have}, mau jual $${amountUSD}`});
  chain.assets[address][symbol]-=amountUSD;
  chain.balances[address]+=amountUSD*10000;
  res.json({ok:true,message:`SELL ${symbol} $${amountUSD}`,balance:chain.balances[address]});
});

app.post('/api/send',(req,res)=>{
  let {from,to,amount}=req.body;
  getBal(from); getBal(to);
  if(chain.balances[from] < amount) return res.json({ok:false,error:'Saldo kurang'});
  chain.balances[from]-=amount;
  chain.balances[to]+=amount;
  let txHash=crypto.randomBytes(16).toString('hex');
  chain.history.push({from,to,amount,txHash});
  res.json({ok:true,txHash});
});

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log('VQI REAL running '+PORT));
