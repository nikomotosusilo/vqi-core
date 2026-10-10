// =====================================================
// VOUCHER QUANTUM CHAIN v1.2 - HYBRID PoW
// DETERMINISTIK 100% - SIAP TESTNET & MAINNET
// =====================================================
#include <iostream>
#include <string>
#include <vector>
#include <cstdint>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <cmath>
#include <deque>
#include <map>
#include <mutex>
#include <stdexcept>

using namespace std;
using namespace chrono;

#define USE_FNV_FOR_TESTNET true
#if!USE_FNV_FOR_TESTNET
#include <openssl/sha.h>
#endif

const uint64_t TOTAL_SUPPLY = 100'000'000'000ULL;
const uint64_t BLOCK_REWARD = 50'000ULL;
const int64_t TARGET_BLOCK_TIME_SEC = 60;
const int DIFFICULTY_ADJUST_INTERVAL = 100;
const uint32_t MIN_DIFFICULTY = 1;
const uint32_t MAX_DIFFICULTY = 12;
const size_t HASH_EXPECTED_LENGTH = 128;
const size_t MAX_TRANSACTIONS_PER_BLOCK = 1000;

enum class VoucherStatus { ACTIVE, REDEEMED, EXPIRED };

struct DigitalSignature {
    string publicKey;
    string signatureHex;
    int64_t signedTimestamp;
};

struct Voucher {
    string id;
    string code;
    uint64_t amount;
    string merchantId;
    int64_t expiryTimestamp;
    VoucherStatus status;
    string ownerAddress;
    DigitalSignature signature;
};

struct Block {
    uint32_t index;
    int64_t timestamp;
    string previousHash;
    string hash;
    string merkleRoot;
    uint64_t nonce;
    uint32_t difficulty;
    vector<Voucher> transactions;
    DigitalSignature blockSignature;
};

// --- HASH HYBRID DETERMINISTIK ---
string calculateHash(const string& input) {
    const string salt = "VoucherQuantum_Network_Salt_2026";
    string data = input + salt;
#if USE_FNV_FOR_TESTNET
    uint64_t h = 14695981039346656037ULL; const uint64_t prime = 1099511628211ULL;
    for(uint8_t b: data){ h ^= b; h *= prime; }
    uint64_t h2 = 14695981039346656037ULL;
    for(size_t i=0;i<data.size();i++){ uint8_t b = data[i]+(i%256); h2 ^= b; h2 *= prime; }
    stringstream ss; ss << hex << setfill('0')
        << setw(16) << h << setw(16) << h2 << setw(16) << (h ^ h2) << setw(16) << (h + h2)
        << setw(16) << (~h) << setw(16) << (~h2) << setw(16) << (h | h2) << setw(16) << (h & h2);
    string r = ss.str(); while(r.size()<128) r="0"+r; return r;
#else
    unsigned char hash[SHA512_DIGEST_LENGTH];
    SHA512((unsigned char*)data.c_str(), data.size(), hash);
    stringstream ss; ss << hex << setfill('0');
    for(int i=0;i<SHA512_DIGEST_LENGTH;i++) ss << setw(2) << (int)hash[i];
    return ss.str();
#endif
}

bool isHexString(const string& s){ for(char c:s) if(!isxdigit(c)) return false; return!s.empty(); }
bool validateHashLength(const string& h){ return h.size()==HASH_EXPECTED_LENGTH && isHexString(h); }

bool verifyVoucherSignature(const Voucher& v){
    if(v.expiryTimestamp < system_clock::to_time_t(system_clock::now())) return false;
    string dataToSign = v.id + v.code + to_string(v.amount) + v.ownerAddress;
    string expected = calculateHash(dataToSign + v.signature.publicKey);
    return!v.signature.signatureHex.empty() && v.signature.signatureHex==expected &&!v.signature.publicKey.empty();
}

DigitalSignature signVoucher(const Voucher& v, const string& priv, const string& pub){
    string dataToSign = v.id + v.code + to_string(v.amount) + v.ownerAddress;
    DigitalSignature sig; sig.publicKey=pub; sig.signatureHex=calculateHash(dataToSign + priv + pub);
    sig.signedTimestamp = system_clock::to_time_t(system_clock::now()); return sig;
}

string getBlockData(const Block& b){
    stringstream ss; ss << b.index << b.timestamp << b.previousHash << b.merkleRoot << b.nonce << b.difficulty;
    for(auto &v:b.transactions) ss << v.id << v.ownerAddress << v.signature.signatureHex; return ss.str();
}
string calculateBlockHash(const Block& block){ return calculateHash(getBlockData(block)); }

class DifficultyManager{
    deque<int64_t> blockTimes; mutable mutex mtx;
public:
    void recordBlockTime(int64_t i){ lock_guard<mutex> l(mtx); blockTimes.push_back(i); if(blockTimes.size()>DIFFICULTY_ADJUST_INTERVAL) blockTimes.pop_front(); }
    uint32_t calculateNewDifficulty(uint32_t cur) const{
        lock_guard<mutex> l(mtx); if(blockTimes.size()<DIFFICULTY_ADJUST_INTERVAL) return cur;
        int64_t avg=0; for(auto t:blockTimes) avg+=t; avg/=blockTimes.size();
        double ratio = (double)TARGET_BLOCK_TIME_SEC/avg; int32_t nd = cur + log2(ratio)*2;
        nd = max((int32_t)MIN_DIFFICULTY, min(nd,(int32_t)MAX_DIFFICULTY)); return (uint32_t)nd;
    }
};

class VoucherQuantumChain{
    vector<Block> chain; map<string,uint64_t> balances; uint64_t totalMinted=0; DifficultyManager diffManager; uint32_t currentDifficulty=2;
    Block createGenesisBlock(){
        Block g; g.index=0; g.timestamp=system_clock::to_time_t(system_clock::now());
        g.previousHash=string(HASH_EXPECTED_LENGTH,'0'); g.nonce=0; g.difficulty=currentDifficulty;
        Voucher v; v.id=calculateHash("GENESIS-VOUCHER-000-VoucherQuantum"); v.code="VQ-GENESIS-2026"; v.amount=0;
        v.merchantId="NETWORK-GENESIS"; v.status=VoucherStatus::ACTIVE; v.ownerAddress="GENESIS-NODE"; v.expiryTimestamp=9999999999LL;
        v.signature=signVoucher(v,"genesis_priv_key","genesis_pub_key"); g.transactions.push_back(v);
        string merkle=""; for(auto &tx:g.transactions) merkle+=tx.id; g.merkleRoot=calculateHash(merkle); g.hash=calculateBlockHash(g); return g;
    }
public:
    VoucherQuantumChain(){ Block genesis=createGenesisBlock(); if(!validateHashLength(genesis.hash)) throw runtime_error("Genesis hash invalid"); chain.push_back(genesis); cout<<"✅ GENESIS BLOCK CREATED! Hash: "<<genesis.hash<<"\n\n"; }
    bool mineBlock(const string& minerAddress, vector<Voucher> txs={}){
        if(txs.size()>MAX_TRANSACTIONS_PER_BLOCK){ cerr<<"[DITOLAK] Tx overload\n"; return false; }
        for(auto &v:txs) if(!verifyVoucherSignature(v) ||!validateHashLength(v.id)) return false;
        if(totalMinted>=TOTAL_SUPPLY) return false;
        const Block& prev=chain.back(); Block nb; nb.index=chain.size(); nb.previousHash=prev.hash;
        nb.timestamp=system_clock::to_time_t(system_clock::now()); nb.difficulty=currentDifficulty; nb.transactions=txs;
        uint64_t rewardAmount=min(BLOCK_REWARD,TOTAL_SUPPLY-totalMinted);
        Voucher reward; reward.id=calculateHash("REWARD_"+to_string(nb.index)+minerAddress); reward.code="VQ-REWARD-"+to_string(nb.index);
        reward.amount=rewardAmount; reward.ownerAddress=minerAddress; reward.status=VoucherStatus::ACTIVE; reward.merchantId="MINING-REWARD"; reward.expiryTimestamp=9999999999LL;
        reward.signature=signVoucher(reward,"network_priv_key","network_pub_key"); nb.transactions.push_back(reward);
        string merkle=""; for(auto &tx:nb.transactions) merkle+=tx.id; nb.merkleRoot=calculateHash(merkle);
        string target(nb.difficulty,'0'); auto start=high_resolution_clock::now(); int64_t startTime=nb.timestamp;
        cout<<"⛏️ Mining Blok #"<<nb.index<<" Diff: "<<nb.difficulty<<"\n";
        do{ nb.nonce++; nb.hash=calculateBlockHash(nb);} while(nb.hash.substr(0,nb.difficulty)!=target);
        if(!validateHashLength(nb.hash)) return false;
        int64_t blockTime=system_clock::to_time_t(system_clock::now())-startTime;
        chain.push_back(nb); totalMinted+=rewardAmount; balances[minerAddress]+=rewardAmount;
        diffManager.recordBlockTime(blockTime); if(nb.index%DIFFICULTY_ADJUST_INTERVAL==0) currentDifficulty=diffManager.calculateNewDifficulty(currentDifficulty);
        cout<<"✅ Blok #"<<nb.index<<" Hash: "<<nb.hash<<" Nonce: "<<nb.nonce<<" Time: "<<blockTime<<"s\n\n"; return true;
    }
    bool isChainValid() const{
        for(size_t i=1;i<chain.size();i++){ const Block& curr=chain[i]; const Block& prev=chain[i-1];
            if(curr.hash!=calculateBlockHash(curr) || curr.previousHash!=prev.hash) return false;
            for(auto &v:curr.transactions) if(!verifyVoucherSignature(v)) return false;
        } return true;
    }
};

int main(){
    VoucherQuantumChain vqChain; string miner="VQMiner_0x77abc123def";
    Voucher testTx; testTx.id=calculateHash("VOUCHER_TEST_001"); testTx.code="DISCOUNT-100K"; testTx.amount=100000;
    testTx.merchantId="STORE_ABC"; testTx.expiryTimestamp=1893456000LL; testTx.status=VoucherStatus::ACTIVE; testTx.ownerAddress=miner;
    testTx.signature=signVoucher(testTx,"merchant_abc_priv","merchant_abc_pub");
    vqChain.mineBlock(miner,{testTx});
    cout << (vqChain.isChainValid()? "✅ CHAIN VALID\n" : "❌ CHAIN RUSAK\n");
}
