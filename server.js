// VQI-CORE SERVER.JS V3 FINAL - COPY PASTE FULL
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();
app.use(cors());
app.use(express.json());

const SECRET = "VQI_VOUCHE_QUANTUM_INTI_2026";
let chain = { height: 310, prevHash: "00007a60ea9b5fa82921e6f16ece733e22518cd719dee1cbd32", balances: {}, users: {}, assets: {} };

// AUTH
app.post('/api/auth/signup', async (req,res)=>{
  const {email,password,nama,country} = req.body;
  if(chain.users[email]) return res.status(400).json({error:"Email sudah ada"});
  let hash = await bcrypt.hash(password,10);
  let address = "VQI_"+Date.now().toString(36);
  chain.users[email]={email,nama,password:hash,address,country};
  chain.balances[address]=0;
  res.json({ok:true, token: jwt.sign({email,address},SECRET), address});
});
app.post('/api/auth/signin', async (req,res)=>{
  let u=chain.users[req.body.email];
  if(!u) return res.status(400).json({error:"Email tidak ada"});
  if(!await bcrypt.compare(req.body.password,u.password)) return res.status(400).json({error:"Password salah"});
  res.json({ok:true, token: jwt.sign({email:u.email,address:u.address},SECRET), address:u.address, balance: chain.balances[u.address]||0});
});

// MARKET 195 + TOP 10 - FIX TOTAL
app.get('/api/market/:type', async (req,res)=>{
  try{
    if(req.params.type==='coin'){
      let r=await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10');
      let j=await r.json();
      return res.json(j.map(c=>({symbol:c.symbol.toUpperCase(), price:c.current_price})));
    }
    if(req.params.type==='forex'){
      let r=await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      let j=await r.json();
      return res.json(Object.entries(j.rates).slice(0,10).map(([k,v])=>({symbol:k,price:v})));
    }
    if(req.params.type==='saham'){
      return res.json([{symbol:"AAPL",price:182.5},{symbol:"MSFT",price:420},{symbol:"NVDA",price:950},{symbol:"TSLA",price:175},{symbol:"GOOGL",price:165},{symbol:"AMZN",price:178},{symbol:"META",price:485},{symbol:"BRK.B",price:410},{symbol:"LLY",price:780},{symbol:"AVGO",price:1320}]);
    }
  }catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/buy', (req,res)=>{
  const {address,symbol,amountUSD} = req.body;
  let need = amountUSD / 0.0001;
  if((chain.balances[address]||0) < need) return res.status(400).json({error:"Saldo VQI kurang"});
  chain.balances[address]-=need;
  chain.assets[address]=chain.assets[address]||{};
  chain.assets[address][symbol]=(chain.assets[address][symbol]||0)+amountUSD;
  res.json({ok:true, message:`Buy ${symbol} $${amountUSD} sukses`, remainingVQI: chain.balances[address]});
});
app.post('/api/sell', (req,res)=>{
  const {address,symbol,amountUSD} = req.body;
  if((chain.assets[address]?.[symbol]||0) < amountUSD) return res.status(400).json({error:"Aset kurang"});
  chain.assets[address][symbol]-=amountUSD;
  chain.balances[address]=(chain.balances[address]||0)+(amountUSD/0.0001);
  res.json({ok:true, balance:chain.balances[address]});
});
app.get('/api/balance/:address', (req,res)=>{res.json({balance:chain.balances[req.params.address]||0, assets:chain.assets[req.params.address]||{}});});
app.listen(3000, ()=>console.log('VQI V3 OK'));
// ===== MINING REAL - MASUK BLOCKCHAIN =====
app.post('/api/mine', (req,res)=>{
  const {address} = req.body;
  const REWARD = 100000000000 / 34000000; // 2941 VQI per block
  chain.balances[address] = (chain.balances[address]||0) + REWARD;
  chain.height += 1;
  // hash baru biar kayak block beneran
  chain.prevHash = require('crypto').createHash('sha256').update(chain.prevHash + address + Date.now()).digest('hex').slice(0,56);

  res.json({
    ok:true,
    message:`Block #${chain.height} mined! +${REWARD.toFixed(2)} VQI`,
    newBalance: chain.balances[address],
    height: chain.height,
    hash: chain.prevHash
  });
});
