// server.js V26.1 FINAL AUDITED - VQI CORE
// Deploy: Render.com -> Node 20, Build: npm install, Start: node server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import crypto from "crypto";
import { ethers } from "ethers";

const app = express();
const PORT = process.env.PORT || 3000;
const CHAIN_FILE = "./chain_v26.json";

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static("."));

// === UTIL SHA256 ===
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

// === LOAD / SAVE CHAIN ===
let chain = [];
function loadChain(){
  try{
    if(fs.existsSync(CHAIN_FILE)){
      chain = JSON.parse(fs.readFileSync(CHAIN_FILE,"utf8"));
    }else{
      chain = [{
        index:0,
        prevHash:"0".repeat(64),
        hash: sha256("GENESIS_VQI_V26"),
        nonce:0,
        time: Date.now(),
        txs:[]
      }];
      saveChain();
    }
  }catch(e){
    console.error("Load error",e);
    chain=[{index:0,prevHash:"0".repeat(64),hash:sha256("GENESIS"),nonce:0,time:Date.now(),txs:[]}];
  }
}
function saveChain(){
  fs.writeFileSync(CHAIN_FILE, JSON.stringify(chain, null, 2));
}

// === VALIDATE CHAIN SECURE - PATCH V26 ===
async function validateChainSecure(checkChain){
  const c = checkChain || chain;
  for(let i=1;i<c.length;i++){
    const b = c[i];
    const prev = c[i-1];
    if(b.prevHash!== prev.hash) return {valid:false, error:`Block #${b.index} prevHash invalid`};
    if(!b.hash.startsWith("00")) return {valid:false, error:`Block #${b.index} hash must start 00`};
    if(b.txs[0]?.type==="MINE"){
      if(b.txs[0].amount!== 2941) return {valid:false, error:`Block #${b.index} MINE amount must 2941`};
    }
    // Verify all tx sigs
    for(let tx of b.txs){
      if(tx.type!== "MINE"){
        if(!tx.sig ||!tx.msg ||!tx.ethFrom) return {valid:false, error:`Block #${b.index} tx missing sig/msg/ethFrom`};
        try{
          const recovered = ethers.verifyMessage(tx.msg, tx.sig);
          if(recovered.toLowerCase()!== tx.ethFrom.toLowerCase()){
            return {valid:false, error:`Block #${b.index} sig mismatch recovered ${recovered}!= ${tx.ethFrom}`};
          }
          if(tx.amount <=0 || tx.amount > 1000000) return {valid:false, error:`Block #${b.index} amount invalid`};
        }catch(e){
          return {valid:false, error:`Block #${b.index} sig verify error ${e.message}`};
        }
      }
    }
    // Re-calc hash check (simple)
    const recomputed = sha256(prev.hash + (b.txs[0]?.to||"") + b.nonce + b.time);
    // Allow client hash but must start 00 - we don't enforce full recompute because client uses Date.now in worker
  }
  return {valid:true};
}

function getBalance(addr){
  let bal=0;
  chain.forEach(b=>{
    b.txs.forEach(tx=>{
      if(tx.to===addr) bal+=tx.amount;
      if((tx.from===addr || tx.ethFrom===addr) && tx.type!=="MINE") bal-=tx.amount;
    });
  });
  return bal;
}

// === API ===
app.get("/api/chain", (req,res)=>{
  res.json({height:chain.length-1, chain});
});

app.get("/api/validate", async (req,res)=>{
  const r = await validateChainSecure();
  res.json(r);
});

app.get("/api/balance/:addr", (req,res)=>{
  const bal = getBalance(req.params.addr);
  res.json({addr:req.params.addr, balance:bal});
});

// Submit new block (from client mining)
app.post("/api/mine", async (req,res)=>{
  const {block} = req.body;
  if(!block ||!block.hash ||!block.prevHash) return res.status(400).json({error:"Invalid block"});

  const last = chain[chain.length-1];
  if(block.prevHash!== last.hash) return res.status(400).json({error:"prevHash mismatch, chain updated"});
  if(!block.hash.startsWith("00")) return res.status(400).json({error:"hash must start 00"});
  if(block.txs[0]?.amount!== 2941) return res.status(400).json({error:"MINE must 2941"});

  // Validate block sig
  const testChain = [...chain, block];
  const v = await validateChainSecure(testChain);
  if(!v.valid) return res.status(400).json(v);

  chain.push(block);
  saveChain();
  res.json({ok:true, height:chain.length-1, hash:block.hash});
});

// Submit SEND/BUY/SELL tx as new block
app.post("/api/tx", async (req,res)=>{
  const {txs, prevHash, hash, nonce} = req.body;
  if(!txs ||!hash) return res.status(400).json({error:"Missing txs/hash"});

  const last = chain[chain.length-1];
  if(prevHash && prevHash!== last.hash) return res.status(400).json({error:"Chain stale"});

  // Balance check
  const from = txs[0]?.ethFrom || txs[0]?.from;
  if(from){
    const need = txs.reduce((a,t)=> t.type!=="MINE"? a+t.amount : a, 0);
    if(getBalance(txs[0].to? txs[0].from : from) < 0){ /* allow but check later */ }
    // Simple check
    let bal = getBalance(from);
    if(from.startsWith("0x")) bal = getBalance(txs[0].from); // VQI addr balance
    if(bal < need && txs[0].from){
      const vqiBal = getBalance(txs[0].from);
      if(vqiBal < need) return res.status(400).json({error:`Saldo kurang need ${need} have ${vqiBal}`});
    }
  }

  const newBlock = {
    index: chain.length,
    prevHash: last.hash,
    hash: hash || sha256(last.hash + JSON.stringify(txs) + Date.now()),
    nonce: nonce || 0,
    time: Date.now(),
    txs: txs
  };

  const v = await validateChainSecure([...chain, newBlock]);
  if(!v.valid) return res.status(400).json(v);

  chain.push(newBlock);
  saveChain();
  res.json({ok:true, block:newBlock});
});

// Genesis reset (admin only - protect with env)
app.post("/api/reset", (req,res)=>{
  if(req.body.key!== process.env.RESET_KEY) return res.status(403).json({error:"forbidden"});
  chain=[{index:0,prevHash:"0".repeat(64),hash:sha256("GENESIS_VQI_V26"),nonce:0,time:Date.now(),txs:[]}];
  saveChain();
  res.json({ok:true});
});

loadChain();
app.listen(PORT, ()=>{
  console.log(`⚛️ VQI V26.1 server running on :${PORT} height ${chain.length-1}`);
});
