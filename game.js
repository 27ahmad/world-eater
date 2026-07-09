"use strict";
/* ============================================================
   WORLD EATER — a complete browser game in one file.
   Sections: utils · save · settings · content data · audio ·
   particles/fx · entities · game loop · render · UI · boot
============================================================ */

/* ---------------- utils ---------------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const angleLerp = (a, b, t) => { let d = ((b - a) % TAU + TAU + Math.PI) % TAU - Math.PI; return a + d * t; };
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const fmtInt = n => Math.floor(n).toLocaleString("en-US");
function fmtTime(s) { s = Math.floor(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
/* per-evolution real-world size anchors (meters), log-interpolated within a stage */
const SIZE_M = [2e-5, 6e-5, 2e-4, 8e-4, 4e-3, 2e-2, 8e-2, 0.3, 1, 3, 10, 40, 150, 500, 2e3, 5e5, 1.2e7, 1.4e9, 9e20, 8.8e26];
function fmtSize(r) {
  let i = 0; while (i < 19 && r >= EVOR[i + 1]) i++;
  const lo = EVOR[i], hi = i < 19 ? EVOR[i + 1] : EVOR[19] * 1.55;
  const mlo = SIZE_M[i], mhi = i < 19 ? SIZE_M[i + 1] : SIZE_M[19] * 100;
  const t = clamp((Math.log(r) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)), 0, 1.5);
  const m = mlo * Math.pow(mhi / mlo, t);
  if (m < 1e-3) return (m * 1e6).toFixed(0) + " µm";
  if (m < 1e-2) return (m * 1e3).toFixed(1) + " mm";
  if (m < 1) return (m * 100).toFixed(1) + " cm";
  if (m < 1e3) return m.toFixed(1) + " m";
  if (m < 1e7) return (m / 1e3).toFixed(1) + " km";
  if (m < 1.4e9) return (m / 1.27e7).toFixed(1) + "× Earth";
  if (m < 9.46e15) return (m / 1.39e9).toFixed(1) + "× Sun";
  if (m < 9.46e18) return (m / 9.46e15).toFixed(1) + " ly";
  if (m < 9.46e21) return (m / 9.46e18).toFixed(1) + " k.ly";
  return (m / 9.46e21).toFixed(2) + " M.ly";
}
const $ = id => document.getElementById(id);

/* ---------------- save system ---------------- */
const Save = (() => {
  const KEY = "worldEaterSave_v1";
  let mem = null; // in-memory fallback when storage is unavailable
  function defaults() {
    return {
      essence: 0, bestScore: 0, runs: 0, totalEaten: 0, totalBossKills: 0,
      maxEvo: 0, victories: 0, totalUpgrades: 0, totalTime: 0,
      owned: { skin_void: true, trail_none: true }, equippedSkin: "skin_void", equippedTrail: "trail_none",
      perks: {}, ach: {}, worlds: { city: true }, world: "city",
      dealId: null, dealExpires: 0, tutorialDone: false,
      settings: { master: 80, music: 55, sfx: 85, shake: true, reduced: false, perf: false, cb: false, ui: 100, muted: false }
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = defaults(), s = JSON.parse(raw);
        const merged = Object.assign(d, s, { settings: Object.assign(d.settings, s.settings || {}) });
        if (merged.runs > 0) merged.tutorialDone = true; // never tutor a veteran
        return merged;
      }
    } catch (e) { /* storage blocked */ }
    return mem ? mem : defaults();
  }
  function store(data) {
    mem = data;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* keep in memory */ }
  }
  function wipe() { mem = null; try { localStorage.removeItem(KEY); } catch (e) {} }
  return { load, store, wipe, defaults };
})();
let P = Save.load();           // persistent profile
const saveP = () => Save.store(P);

/* ---------------- evolutions (20 stages) ---------------- */
/* r: radius threshold (world units), hue, spikes, eyes, aura */
const EVOS = [
  { name: "The Mote",        r: 8 },
  { name: "Hungry Microbe",  r: 13 },
  { name: "Devourer Amoeba", r: 20 },
  { name: "Ravenous Mite",   r: 31 },
  { name: "Gnashing Larva",  r: 48 },
  { name: "Chitin Fiend",    r: 74 },
  { name: "Fang Spiderling", r: 115 },
  { name: "Vermin Glutton",  r: 178 },
  { name: "Sewer Maw",       r: 276 },
  { name: "Alley Stalker",   r: 428 },
  { name: "Street Horror",   r: 663 },
  { name: "Block Behemoth",  r: 1028 },
  { name: "Titanspawn",      r: 1593 },
  { name: "True Kaiju",      r: 2470 },
  { name: "City Render",     r: 3828 },
  { name: "Continental Maw", r: 5933 },
  { name: "World Eater",     r: 9197 },
  { name: "Star Devourer",   r: 14255 },
  { name: "Galactic Hunger", r: 22095 },
  { name: "Void Sovereign",  r: 34248 }
];
EVOS.forEach((e, i) => {
  e.i = i;
  e.spikes = Math.min(3 + i, 18);
  e.hueShift = i * 9;
  e.aura = i / 19;
});
const EVOR = EVOS.map(e => e.r);

/* ---------------- scale bands (background themes) ---------------- */
const BANDS = [
  { upTo: 3,  top: "#080c12", bot: "#0f1c1f", deco: "micro",  name: "Petri Depths" },
  { upTo: 7,  top: "#0a1016", bot: "#13221e", deco: "ground", name: "The Underfoot" },
  { upTo: 10, top: "#090d16", bot: "#0f1c24", deco: "street", name: "The Streets" },
  { upTo: 13, top: "#070b12", bot: "#121b27", deco: "city",   name: "Skyline" },
  { upTo: 16, top: "#04060d", bot: "#0b151f", deco: "planet", name: "Orbit" },
  { upTo: 19, top: "#020307", bot: "#070e17", deco: "cosmos", name: "The Deep Void" }
];
const bandFor = evo => BANDS.find(b => evo <= b.upTo);

/* ---------------- consumables: 100 unique objects (5 per tier) ----------------
   shape: blob (creature/organic) · rect (structure) · poly (vehicle/object) · glow (cosmic) */
const CONSUMABLES = [
  [["Dust Mote","blob","#9b8f7a"],["Pollen Grain","blob","#e8d05a"],["Bacterium","blob","#7ad07a"],["Spore Cloudlet","blob","#b27ad0"],["Sugar Crystal","poly","#e8f0ff"]],
  [["Crumb","poly","#c9a05a"],["Seed","blob","#a07840"],["Amoeba","blob","#6ad0b0"],["Algae Fleck","blob","#5ab85a"],["Salt Grain","poly","#dfe6ee"]],
  [["Ant","blob","#8a3b2a"],["Aphid","blob","#9ad04a"],["Rice Grain","poly","#efe8d8"],["Bread Crust","poly","#d0a35a"],["Dust Mite","blob","#bfae8e"]],
  [["Beetle","blob","#3b4a8a"],["Garden Spider","blob","#5a4a3a"],["Green Pea","blob","#7ad04a"],["Wild Berry","blob","#c04a7a"],["Earthworm","blob","#c08a7a"]],
  [["Field Mouse","blob","#9a8a7a"],["Cricket","blob","#6a7a3a"],["Lost Coin","poly","#e8c44a"],["Bottle Cap","poly","#d05a5a"],["Grape","blob","#8a4ac0"]],
  [["Sewer Rat","blob","#6a6a72"],["Sparrow","blob","#a8865a"],["Fallen Apple","blob","#d04a4a"],["Soda Can","poly","#4a8ad0"],["Pond Frog","blob","#4aa05a"]],
  [["Pigeon","blob","#8a8a9a"],["Dropped Sandwich","poly","#d0b06a"],["Loose Brick","rect","#b05a4a"],["Old Boot","poly","#6a5a4a"],["Squirrel","blob","#b07a4a"]],
  [["Stray Cat","blob","#d08a4a"],["Trash Bag","blob","#3a3a44"],["Fire Hydrant","poly","#d04a4a"],["Mailbox","rect","#4a6ad0"],["Watermelon","blob","#4aa05a"]],
  [["Guard Dog","blob","#8a6a4a"],["Bicycle","poly","#5ad0c0"],["Park Bench","rect","#7a5a3a"],["Street Sign","poly","#4ad08a"],["Oil Barrel","rect","#d08a3a"]],
  [["Scooter","poly","#d05a9a"],["Vending Machine","rect","#d04a6a"],["Motorbike","poly","#5a5ad0"],["Hot Dog Cart","rect","#e8d05a"],["Phone Booth","rect","#d04a4a"]],
  [["Sedan","poly","#5a8ad0"],["Oak Tree","blob","#3a8a4a"],["Delivery Van","rect","#d0d0da"],["Bronze Statue","poly","#8aa07a"],["Fountain","poly","#5ab8d0"]],
  [["City Bus","rect","#e8b04a"],["Semi Truck","rect","#b05a5a"],["Suburban House","rect","#d09a6a"],["Battle Tank","poly","#5a6a4a"],["Billboard","rect","#d05ad0"]],
  [["Mansion","rect","#d0c09a"],["Corner Store","rect","#5ad08a"],["Train Car","rect","#7a5ad0"],["Luxury Yacht","poly","#e8e8f0"],["Water Tower","poly","#8a9ab0"]],
  [["Skyscraper","rect","#5a7ad0"],["Steel Bridge","rect","#9a8a7a"],["Stadium","poly","#d0d05a"],["Ferris Wheel","poly","#d05a8a"],["Cargo Ship","rect","#b04a4a"]],
  [["City Block","rect","#6a6a9a"],["Granite Hill","blob","#7a7a6a"],["Hydro Dam","rect","#8ab0d0"],["Airport","rect","#9a9aaa"],["Cruise Liner","rect","#e8e8f0"]],
  [["Mountain","poly","#8a8aa0"],["Island","blob","#5aa06a"],["Glacier","poly","#b0e0f0"],["Volcano","poly","#d05a3a"],["Megacity","rect","#7a8ad0"]],
  [["Continent","blob","#5a9a6a"],["Ocean","blob","#3a6ad0"],["The Moon","glow","#d0d0da"],["Iron Asteroid","poly","#8a7a6a"],["Comet","glow","#aee8ff"]],
  [["Rocky Planet","glow","#c08a5a"],["Gas Giant","glow","#d0a04a"],["Ice World","glow","#9ad0f0"],["Ring World","glow","#d0b08a"],["Dwarf Star","glow","#ffd86a"]],
  [["Blue Star","glow","#8ab8ff"],["Nebula","glow","#d06ad0"],["Pulsar","glow","#6af0ff"],["Solar System","glow","#ffd04a"],["Wormhole","glow","#9a5aff"]],
  [["Spiral Galaxy","glow","#b09aff"],["Black Hole","glow","#5a3a8a"],["Quasar","glow","#7adfff"],["Star Cluster","glow","#fff0a0"],["Dark Matter Cloud","glow","#6a4a9a"]]
];

/* ---------------- enemies: 40 hostile types (2 per tier) ----------------
   ai: wander | chase | dart | shooter */
const ENEMIES = [
  [["Hostile Phage","chase","#d04a8a"],["Spiked Cell","wander","#8ad04a"]],
  [["Hydra Polyp","wander","#4ad0a0"],["Lash Flagellate","dart","#d0d04a"]],
  [["Fire Ant","chase","#e05a2a"],["Pinch Beetle","wander","#5a4ad0"]],
  [["Hunter Wasp","dart","#e8c02a"],["Wolf Spider","chase","#7a5a3a"]],
  [["Shrew","chase","#9a7a6a"],["Mantis","dart","#5ad05a"]],
  [["Viper","dart","#5aa04a"],["Crow","wander","#3a3a4a"]],
  [["Feral Cat","chase","#d09a4a"],["Rat King","wander","#6a6a7a"]],
  [["Stray Hound","chase","#8a6a4a"],["Hawk","dart","#b08a5a"]],
  [["Police Drone","shooter","#5ab8ff"],["Junkyard Dog","chase","#7a5a44"]],
  [["Riot Bot","shooter","#d05a5a"],["Animal Control Van","chase","#e8e8f0"]],
  [["Police Cruiser","chase","#4a6ad0"],["Attack Chopper","shooter","#5a5a6a"]],
  [["Army Jeep","chase","#6a7a4a"],["Gun Turret","shooter","#8a8a9a"]],
  [["Heavy Tank","shooter","#5a6a4a"],["Fighter Jet","dart","#9aa0b0"]],
  [["Missile Battery","shooter","#b05a4a"],["Mech Walker","chase","#7a8ad0"]],
  [["Rail Cannon","shooter","#8a9ab0"],["War Zeppelin","wander","#b0a08a"]],
  [["Orbital Laser","shooter","#ff6a8a"],["Storm Titan","chase","#8ad0ff"]],
  [["Defense Satellite","shooter","#d0d0e8"],["Asteroid Swarm","dart","#9a8a7a"]],
  [["Plasma Leviathan","chase","#ff9a4a"],["Void Ray","dart","#9a6aff"]],
  [["Solar Serpent","dart","#ffd04a"],["Antimatter Wisp","chase","#7af0ff"]],
  [["Reality Warden","shooter","#e8e8ff"],["Entropy Shade","chase","#6a4a9a"]]
];

/* ---------------- bosses: 10 ----------------
   pattern flags: dash · shoot · summon · split */
const BOSSES = [
  { evo: 2,  name: "ALPHA PHAGE",      color: "#d04a8a", hp: 60,   dash: true,                 desc: "The first rival" },
  { evo: 4,  name: "HIVE QUEEN",       color: "#e8c02a", hp: 140,  summon: true,               desc: "Endless brood" },
  { evo: 6,  name: "SEWER KING",       color: "#6a8a5a", hp: 300,  dash: true, summon: true },
  { evo: 8,  name: "PACK ALPHA",       color: "#b06a3a", hp: 620,  dash: true, split: true },
  { evo: 10, name: "MILITARY TITAN",   color: "#5a6a4a", hp: 1200, shoot: true },
  { evo: 12, name: "STEEL COLOSSUS",   color: "#8a9ab0", hp: 2300, shoot: true, dash: true },
  { evo: 14, name: "MEGA KAIJU",       color: "#d05a3a", hp: 4200, dash: true, summon: true },
  { evo: 16, name: "PLANET GUARDIAN",  color: "#5ad0a0", hp: 7600, shoot: true, summon: true },
  { evo: 18, name: "COSMIC SENTINEL",  color: "#9a6aff", hp: 13000, shoot: true, dash: true },
  { evo: 19, name: "THE LAST LIGHT",   color: "#fff0c0", hp: 22000, shoot: true, dash: true, summon: true, final: true }
];

/* ---------------- upgrades: 50 ---------------- */
function U(id, icon, name, desc, rarity, apply, max) { return { id, icon, name, desc, rarity, apply, max: max || 5 }; }
const UPGRADES = [
  U("vacuum","🌀","Vacuum Field","+30% attraction radius","common",s=>s.magnet*=1.3),
  U("predator","⚡","Predator","+12% movement speed","common",s=>s.speed*=1.12),
  U("density","🪨","Density","Devour targets up to 8% larger","rare",s=>s.biteSize+=0.08,4),
  U("ravenous","🍖","Ravenous","+20% XP from everything","common",s=>s.xpMult*=1.2),
  U("regen","💚","Regeneration","+1.2 HP per second","common",s=>s.regen+=1.2),
  U("thickhide","🛡️","Thick Hide","-15% damage taken","common",s=>s.armor*=0.85),
  U("gourmand","🍽️","Gourmand","+15% growth per meal","common",s=>s.growMult*=1.15),
  U("longtongue","👅","Long Tongue","+25% eating reach","common",s=>s.reach*=1.25,4),
  U("comboglue","⏱️","Combo Glue","Combos last 1s longer","common",s=>s.comboTime+=1,4),
  U("comboheat","🔥","Combo Heat","+10% score per combo step","rare",s=>s.comboBonus+=0.1,4),
  U("vitality","❤️","Vitality","+25 max HP, heal 25","common",s=>{s.maxHp+=25;s.heal=25;}),
  U("adrenal","💉","Adrenal Glands","Eating heals 1 HP","rare",s=>s.eatHeal+=1,3),
  U("frenzy","😈","Frenzy","+8% speed while combo ≥ 10","rare",s=>s.frenzySpeed+=0.08,4),
  U("burst","💥","Shockwave Gut","Every 25 eats releases a stunning pulse","epic",s=>s.shockEvery=Math.max(10,(s.shockEvery||30)-5),4),
  U("magnetcore","🧲","Magnet Core","+60% attraction radius","rare",s=>s.magnet*=1.6,3),
  U("swift","💨","Swift Cilia","+20% acceleration","common",s=>s.accel*=1.2),
  U("greed","💰","Greed","+25% score gain","common",s=>s.scoreMult*=1.25),
  U("lucky","🍀","Lucky Gut","+10% chance meals count double","rare",s=>s.doubleChance+=0.1,5),
  U("ironjaw","🦷","Iron Jaw","+40% damage to bosses","rare",s=>s.bossDmg*=1.4),
  U("momentum","🏃","Momentum","Top speed +6% per evolution this run","epic",s=>s.evoSpeed+=0.06,3),
  U("thorns","🌵","Reactive Spines","Reflect 20% of collision damage","rare",s=>s.thorns+=0.2,3),
  U("slipstream","🌊","Slipstream","Dash briefly after every 10 eats","epic",s=>s.dashEvery=10,1),
  U("hardshell","🐚","Hard Shell","Immunity window after damage +0.5s","common",s=>s.iframes+=0.5,3),
  U("seismic","🌋","Seismic Bite","Big meals shake loose bonus shards","rare",s=>s.shardChance+=0.15,4),
  U("xpcrystal","💎","XP Crystals","Bonus shards worth +50% XP","rare",s=>s.shardValue*=1.5,3),
  U("apex","👑","Apex Appetite","+10% XP and +10% growth","epic",s=>{s.xpMult*=1.1;s.growMult*=1.1;}),
  U("blackhole","🕳️","Black Hole Belly","Attraction pulls 40% faster","rare",s=>s.magnetPull*=1.4,3),
  U("titan","🗿","Titan Blood","+40 max HP","common",s=>{s.maxHp+=40;s.heal=40;}),
  U("evolveheal","✨","Molting","Fully heal on evolution","epic",s=>s.evoHeal=true,1),
  U("scavenger","🦴","Scavenger","Destroyed enemies drop 2x shards","rare",s=>s.enemyShards*=2,3),
  U("stilljaw","🧊","Still Jaw","Hit-stop on big eats +50% (chunkier feel)","common",s=>s.hitstopMult*=1.5,2),
  U("farsight","🔭","Far Sight","Camera zooms out 10% (see more prey)","common",s=>s.zoomOut*=1.1,3),
  U("rage","🩸","Blood Rage","+25% speed for 3s after taking damage","rare",s=>s.rageOnHit=true,1),
  U("bulwark","🏰","Bulwark","Bigger threats deal 25% less damage","rare",s=>s.bigArmor*=0.75,3),
  U("sprinter","🐆","Sprinter","+18% top speed","rare",s=>s.speed*=1.18,3),
  U("feast","🥩","Feast Engine","Combo ≥ 25: +50% growth","epic",s=>s.feastGrow=true,1),
  U("undertow","🌪️","Undertow","Nearby small prey drift toward you always","rare",s=>s.undertow=true,1),
  U("patience","🧘","Patient Hunger","XP needed per level -8%","rare",s=>s.xpNeedMult*=0.92,4),
  U("doublebite","😬","Double Bite","Eating chains to 1 nearby smaller object","epic",s=>s.chainBite+=1,3),
  U("starving","☠️","Starving Edge","+30% XP, -15% max HP","epic",s=>{s.xpMult*=1.3;s.maxHp=Math.max(40,s.maxHp*0.85);}),
  U("guardian","😇","Guardian Angel","Survive one killing blow per run","legend",s=>s.cheatDeath=(s.cheatDeath||0)+1,2),
  U("singularity","🌌","Singularity","Attraction radius +120%","legend",s=>s.magnet*=2.2,1),
  U("omnivore","🌍","Omnivore","Devour targets up to 15% larger","legend",s=>s.biteSize+=0.15,2),
  U("timeeater","⏳","Time Eater","Everything else moves 12% slower","legend",s=>s.timeSlow*=0.88,2),
  U("colossus","🦖","Colossus Gene","Instantly grow 20%","legend",s=>s.instaGrow=1.2,2),
  U("echo","📡","Echo Pulse","Shockwaves are 50% larger","rare",s=>s.shockSize*=1.5,3),
  U("vampiric","🧛","Vampiric Maw","Boss bites heal 3 HP","rare",s=>s.bossHeal+=3,3),
  U("cosmicluck","🎰","Cosmic Luck","Auto-mutation weighs an extra option","legend",s=>s.choices+=1,1),
  U("afterburn","☄️","Afterburner","Leave a damaging wake that pops small prey","epic",s=>s.afterburn=true,1),
  U("zenith","🌠","Zenith","+15% to speed, XP, growth and score","legend",s=>{s.speed*=1.15;s.xpMult*=1.15;s.growMult*=1.15;s.scoreMult*=1.15;},1)
];
const RARITY_W = { common: 100, rare: 42, epic: 14, legend: 4 };

const UPGRADE_DIETS = {
  predator: "blob", sprinter: "blob", regen: "blob", vitality: "blob", titan: "blob",
  adrenal: "blob", thorns: "blob", longtongue: "blob", apex: "blob", evolveheal: "blob",
  vampiric: "blob", colossus: "blob", rage: "blob", ravenous: "blob", feast: "blob", starving: "blob",
  density: "poly", omnivore: "poly", swift: "poly", stilljaw: "poly", seismic: "poly",
  xpcrystal: "poly", scavenger: "poly", afterburn: "poly", frenzy: "poly",
  thickhide: "rect", hardshell: "rect", bulwark: "rect", greed: "rect", lucky: "rect",
  farsight: "rect", patience: "rect", cosmicluck: "rect",
  vacuum: "glow", magnetcore: "glow", singularity: "glow", blackhole: "glow", undertow: "glow",
  doublebite: "glow", comboglue: "glow", comboheat: "glow", burst: "glow", echo: "glow",
  timeeater: "glow", ironjaw: "glow", zenith: "glow"
};

/* ---------------- worlds: 5 ---------------- */
const WORLDS = [
  { id:"city",  name:"Modern City",     price:0,    grad:["#1a2030","#2a2438"], tint:"#5a8ad0",
    desc:"Streets, sirens and skyscrapers.", skin:null },
  { id:"medieval", name:"Medieval Kingdom", price:150, grad:["#202615","#3a2c18"], tint:"#c0a05a",
    desc:"Carts, castles and catapults.",
    skin:{8:["Ox Cart","Hay Bale","Market Stall","Wooden Cart","Ale Barrel"],10:["War Horse","Old Oak","Hay Wagon","Stone Idol","Village Well"],11:["Royal Carriage","Siege Ram","Thatch Cottage","Catapult","Town Banner"],12:["Manor House","Blacksmith","Supply Wagon","River Barge","Watchtower"],13:["Castle Keep","Stone Bridge","Tourney Grounds","Trebuchet","War Galley"],14:["Walled Town","Green Hill","Mill Dam","Royal Court","Grand Galleon"]} },
  { id:"pirate", name:"Pirate Ocean",   price:300,  grad:["#0e2230","#143a4a"], tint:"#3ab0c0",
    desc:"Loot every ship on the seven seas.",
    skin:{8:["Rowboat","Crab Pot","Driftwood","Buoy","Rum Barrel"],10:["Sloop","Palm Tree","Fishing Boat","Tiki Idol","Tide Pool"],11:["Brigantine","Whale","Beach Hut","Cannon","Jolly Roger"],12:["Galleon","Trading Post","Treasure Barge","Pirate Yacht","Lighthouse"],13:["Man-o-War","Rope Bridge","Pirate Cove","Kraken Wheel","Ghost Ship"],14:["Port Town","Volcano Isle","Reef Dam","Pirate Haven","Flagship"]} },
  { id:"future", name:"Future Megacity",price:500,  grad:["#0b131f","#112235"], tint:"#00f5d4",
    desc:"Neon, drones and chrome towers.",
    skin:{8:["Hoverboard","Servo Bot","Holo Bench","Neon Sign","Fuel Cell"],10:["Hovercar","Bio Tree","Cargo Drone","Chrome Statue","Plasma Fount"],11:["Maglev Bus","Hauler Mech","Pod House","Hover Tank","Holo Board"],12:["Arcology Pod","Synth Mall","Maglev Car","Sky Yacht","Data Tower"],13:["Chrome Spire","Sky Bridge","Neon Arena","Orbital Wheel","Star Freighter"],14:["Mega Block","Terraform Hill","Fusion Dam","Spaceport","Colony Ship"]} },
  { id:"alien", name:"Alien Planet",    price:800,  grad:["#0f2a1e","#26143a"], tint:"#7cff6b",
    desc:"Nothing here evolved to be eaten. Eat it anyway.",
    skin:{8:["Spore Pod","Crystal Bug","Bone Perch","Glyph Stone","Acid Sac"],10:["Dune Strider","Tendril Tree","Husk Crawler","Totem Spine","Sap Geyser"],11:["Carapace Bus","Brood Hauler","Hive Hut","Spine Tank","Glow Pylon"],12:["Hive Manor","Chitin Market","Larva Train","Reef Skiff","Spore Tower"],13:["Bone Spire","Sinew Bridge","Brood Arena","Ring Organism","Leviathan Husk"],14:["Hive City","Coral Mount","Membrane Dam","Nest Plateau","World Worm"]} }
];

/* ---------------- meta shop: 50 unlockables ---------------- */
const SHOP = [];
(function buildShop(){
  const skins = [
    ["skin_void","Void Spawn","#00f5d4",0],["skin_ember","Ember","#ff6a3a",40],["skin_toxin","Toxin","#7cff6b",40],
    ["skin_abyss","Abyss","#3a6aff",60],["skin_blood","Blood Tide","#ff3a5e",60],["skin_gold","Gilded","#ffd04a",80],
    ["skin_frost","Frostbite","#8ae8ff",80],["skin_rose","Rose Horror","#ff7ad0",100],["skin_slate","Slate","#9aa0b0",100],
    ["skin_acid","Acid Rain","#c8ff3a",120],["skin_royal","Royal","#8a3aff",140],["skin_coral","Coral","#ff9a7a",140],
    ["skin_ghost","Ghost","#e8e8ff",170],["skin_inferno","Inferno","#ff4a1a",200],["skin_ocean","Deep Ocean","#1a8aff",200],
    ["skin_venom","Venom","#3aff9a",230],["skin_nova","Nova","#fff0a0",260],["skin_eclipse","Eclipse","#4a3a6a",300],
    ["skin_prism","Prism","#aaffee",350],["skin_omega","Omega","#ffffff",500]
  ];
  skins.forEach(s=>SHOP.push({id:s[0],type:"skins",name:s[1],color:s[2],price:+s[3],desc:"Hunger skin"}));
  const trails = [
    ["trail_none","No Trail","#666",0],["trail_spark","Sparks","#ffd04a",50],["trail_slime","Slime","#7cff6b",50],
    ["trail_ember","Embers","#ff6a3a",80],["trail_frost","Frost","#8ae8ff",80],["trail_void","Void Wake","#00f5d4",120],
    ["trail_blood","Blood Drip","#ff3a5e",120],["trail_star","Stardust","#fff0a0",180],["trail_neon","Neon Stream","#3affd0",220],
    ["trail_galaxy","Galaxy Dust","#b09aff",300]
  ];
  trails.forEach(s=>SHOP.push({id:s[0],type:"trails",name:s[1],color:s[2],price:+s[3],desc:"Movement trail"}));
  const perks = [
    ["perk_head","Head Start","Begin runs 15% larger",120,"#7cff6b"],
    ["perk_legs","Quick Spawn","+8% base speed",140,"#5ab8ff"],
    ["perk_gut","Wide Gullet","+10% base attraction",140,"#00f5d4"],
    ["perk_skin","Calloused Skin","-10% damage taken",160,"#ff9a3d"],
    ["perk_brain","Hungry Mind","+10% XP forever",180,"#ff7ad0"],
    ["perk_heart","Big Heart","+20 starting max HP",160,"#ff4d5e"],
    ["perk_greed","Essence Nose","+15% essence from runs",200,"#7cff6b"],
    ["perk_reroll","Reroll Gland","Auto-mutation weighs 2 extra options",260,"#ffd04a"],
    ["perk_revive","Stubborn Cells","Start each run with Guardian Angel",420,"#e8e8ff"],
    ["perk_combo","Sticky Combo","Combos last +0.5s",180,"#3affd0"],
    ["perk_boss","Boss Hunter","+20% damage to bosses",220,"#ff6a3a"],
    ["perk_lucky","Loaded Dice","Rare+ upgrades appear more often",320,"#c8ff3a"],
    ["perk_magnet2","Event Horizon","+15% base attraction (stacks)",260,"#8a3aff"],
    ["perk_growth","Apex Genes","+8% growth forever",300,"#7cff6b"],
    ["perk_start2","Born Hungry","Start at level 2 with one upgrade",380,"#fff0a0"]
  ];
  perks.forEach(s=>SHOP.push({id:s[0],type:"perks",name:s[1],desc:s[2],price:s[3],color:s[4]}));
  // 20 skins + 10 trails + 15 perks + 5 worlds (purchased in world menu) = 50 unlockables
})();

/* ---------------- visual SVG engines & shop helpers ---------------- */
function getDietSvg(type, color) {
  if (type === "blob" || type === "organic") {
    return `<svg class="diet-icon" viewBox="0 0 24 24" style="width:14px; height:14px; fill:none; stroke:${color || "#00f5a0"}; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round"><path d="M12 22V12"></path><path d="M12 12c4-2 6-6 6-10-4 0-8 2-10 6"></path><path d="M12 15c-3-1.5-5-4.5-5-7.5 3 0 5 1.5 6.5 4.5"></path></svg>`;
  }
  if (type === "rect" || type === "structural") {
    return `<svg class="diet-icon" viewBox="0 0 24 24" style="width:14px; height:14px; fill:none; stroke:${color || "#ff9a3d"}; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;
  }
  if (type === "poly" || type === "kinetic") {
    return `<svg class="diet-icon spin-prop" viewBox="0 0 24 24" style="width:14px; height:14px; fill:none; stroke:${color || "#00bbf9"}; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round"><circle cx="12" cy="12" r="3"></circle><path d="M12 9c0-3 2-5 4-5s2 2 0 5-4 1-4 1z"></path><path d="M12 15c0 3-2 5-4 5s-2-2 0-5 4-1 4-1z"></path></svg>`;
  }
  if (type === "glow" || type === "cosmic") {
    return `<svg class="diet-icon spin-gal" viewBox="0 0 24 24" style="width:14px; height:14px; fill:none; stroke:${color || "#d946ef"}; stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round"><path d="M12 3a9 9 0 0 1 9 9"></path><path d="M12 21a9 9 0 0 1-9-9"></path><path d="M12 7a5 5 0 0 1 5 5"></path><path d="M12 17a5 5 0 0 1-5-5"></path><circle cx="12" cy="12" r="1.5" fill="${color || "#d946ef"}"></circle></svg>`;
  }
  return "";
}

function getPerkSvg(id, color) {
  const c = color || "currentColor";
  const start = `<svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:none; stroke:${c}; stroke-width:2; stroke-linecap:round; stroke-linejoin:round">`;
  const end = `</svg>`;
  let body = "";
  if (id === "perk_head") body = `<path d="M2 4l4 12h12l4-12-5 3-5-7-5 7z"></path>`;
  else if (id === "perk_legs") body = `<path d="M13 5l7 7-7 7m-8-14l7 7-7 7"></path>`;
  else if (id === "perk_gut") body = `<path d="M6 9a6 6 0 0 1 12 0v6a3 3 0 0 1-6 0v-2a1 1 0 0 0-2 0v2a3 3 0 0 1-6 0V9z"></path>`;
  else if (id === "perk_skin") body = `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>`;
  else if (id === "perk_brain") body = `<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.9 1c-.8.2-1.6.2-2.4-.2A4 4 0 0 1 3 14c0-.9.2-1.7.6-2.5-.4-.8-.6-1.6-.6-2.5a4 4 0 0 1 6.5-3.1v-.9A2.5 2.5 0 0 1 9.5 2z"></path><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.9 1c.8.2 1.6.2 2.4-.2A4 4 0 0 0 21 14c0-.9-.2-1.7-.6-2.5.4-.8.6-1.6.6-2.5a4 4 0 0 0-6.5-3.1v-.9A2.5 2.5 0 0 0 14.5 2z"></path>`;
  else if (id === "perk_heart") body = `<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path>`;
  else if (id === "perk_greed") body = `<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>`;
  else if (id === "perk_reroll") body = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8" cy="8" r="1" fill="${c}"></circle><circle cx="16" cy="16" r="1" fill="${c}"></circle><circle cx="12" cy="12" r="1" fill="${c}"></circle>`;
  else if (id === "perk_revive") body = `<path d="M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm-7 8c-2 0-3 3-3 5v2h8v-7H5zm14 0c2 0 3 3 3 5v2h-8v-7h8z"></path>`;
  else if (id === "perk_combo") body = `<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>`;
  else if (id === "perk_boss") body = `<path d="M14.5 17.5L3 6V3h3l11.5 11.5m-3.5-3.5L17.5 14.5m-7-7L7 11"></path>`;
  else if (id === "perk_lucky") body = `<path d="M12 10a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 4a3 3 0 1 0 3 3 3 3 0 0 0-3-3zm-4-2a3 3 0 1 0 3 3 3 3 0 0 0-3-3zm8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM12 14v6"></path>`;
  else if (id === "perk_magnet2") body = `<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 16a6 6 0 1 1 6-6 6 6 0 0 1-6 6z"></path>`;
  else if (id === "perk_growth") body = `<path d="M4.5 10.5C4.5 5 12 5 12 12s7.5 7 7.5 1.5M19.5 10.5C19.5 5 12 5 12 12S4.5 19 4.5 13.5"></path>`;
  else if (id === "perk_start2") body = `<path d="M12 2C8 2 4 10 4 15c0 4 3 7 8 7s8-3 8-7c0-5-4-13-8-13z"></path>`;
  else body = `<circle cx="12" cy="12" r="8"></circle>`;
  return start + body + end;
}

function getTrailSvg(id, color) {
  const c = color || "currentColor";
  if (id === "trail_none") {
    return `<svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:none; stroke:${c}; stroke-width:2; stroke-linecap:round"><circle cx="12" cy="12" r="8"></circle><path d="M6.3 6.3l11.4 11.4"></path></svg>`;
  }
  // fading particle wake — the same motif the trail draws in-game
  return `<svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:${c}"><circle cx="4.5" cy="18" r="1.6" opacity="0.3"></circle><circle cx="10" cy="13.5" r="2.2" opacity="0.55"></circle><circle cx="16" cy="9" r="2.8" opacity="0.8"></circle><circle cx="20.5" cy="4.5" r="1.4" opacity="0.45"></circle></svg>`;
}

function getAchSvg(id, color) {
  const c = color || "currentColor";
  const start = `<svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:none; stroke:${c}; stroke-width:2; stroke-linecap:round; stroke-linejoin:round">`;
  const end = `</svg>`;
  let body = "";
  if (id.startsWith("evo") || id === "victory") {
    body = `<path d="M4.5 10.5C4.5 5 12 5 12 12s7.5 7 7.5 1.5M19.5 10.5C19.5 5 12 5 12 12S4.5 19 4.5 13.5"></path>`;
  } else if (id.startsWith("combo")) {
    body = `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>`;
  } else if (id.startsWith("score")) {
    body = `<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34M12 2a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"></path>`;
  } else if (id.startsWith("eat")) {
    body = `<path d="M12 2a10 10 0 0 0-10 10h10v-10zM12 22a10 10 0 0 0 10-10h-10v10z"></path>`;
  } else if (id.startsWith("boss")) {
    body = `<path d="M9 10H6v2h3v-2zm9 0h-3v2h3v-2zm-6 5h-2v2h2v-2z"></path><rect x="4" y="4" width="16" height="13" rx="4"></rect><path d="M9 17v3h6v-3"></path>`;
  } else if (id.startsWith("world")) {
    body = `<circle cx="12" cy="12" r="10"></circle><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>`;
  } else if (id.startsWith("time")) {
    body = `<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>`;
  } else if (id.startsWith("runs")) {
    body = `<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>`;
  } else if (id.startsWith("ups")) {
    body = `<polyline points="18 15 12 9 6 15"></polyline>`;
  } else {
    body = `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>`;
  }
  return start + body + end;
}

function getShopItemTier(it) {
  const price = it.price;
  if (price >= 300 || it.id === "perk_revive" || it.id === "perk_start2" || it.id === "perk_lucky") return "legendary";
  if (price >= 180 || it.id === "perk_growth" || it.id === "perk_magnet2" || it.id === "perk_greed") return "epic";
  if (price >= 80 || it.id === "perk_brain" || it.id === "perk_heart" || it.id === "perk_boss" || it.id === "perk_combo" || it.id === "perk_reroll") return "rare";
  return "common";
}

function checkShopDeal() {
  if (P.dealId && P.dealExpires > Date.now()) {
    if (P.owned[P.dealId]) {
      P.dealId = null;
      P.dealExpires = 0;
      saveP();
    } else {
      return;
    }
  }
  const locked = SHOP.filter(it => !P.owned[it.id] && it.price > 0);
  if (locked.length > 0) {
    const target = pick(locked);
    P.dealId = target.id;
    P.dealExpires = Date.now() + 20 * 60 * 1000;
    saveP();
  } else {
    P.dealId = null;
    P.dealExpires = 0;
  }
}

function updateShopDealTimer() {
  const container = $("shopDealContainer");
  if (!P.dealId || P.dealExpires <= Date.now()) {
    checkShopDeal();
    if (!P.dealId) {
      container.style.display = "none";
      return;
    }
  }
  const it = SHOP.find(x => x.id === P.dealId);
  if (!it) {
    container.style.display = "none";
    return;
  }
  container.style.display = "flex";
  const typeText = it.type === "skins" ? "Skin" : it.type === "trails" ? "Trail" : "Perk";
  $("shopDealTitle").innerHTML = `${getDietSvg(it.type === "perks" ? "organic" : (it.type === "skins" ? "organic" : "kinetic"), it.color)} <span style="color:${it.color || "#fff"}">${it.name}</span> (${typeText})`;
  const diff = P.dealExpires - Date.now();
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  $("shopDealTimer").textContent = "Offer expires in: " + mins + ":" + String(secs).padStart(2, "0");
  const discounted = Math.max(1, Math.floor(it.price * 0.75));
  $("shopDealBuyBtn").innerHTML = `BUY - <span class="essence-chip" style="border:none; padding:0; background:none; color:inherit">${discounted}</span>`;
}

let previewMote = { x: 45, y: 45, r: 15, faceA: 0, mouth: 0 };
let previewTrailParts = [];
let hoveredShopItem = null;

function renderShopPreview() {
  const canvas = $("shopPreviewCanvas");
  if (!canvas) return;
  const c = canvas.getContext("2d");
  const t = performance.now() / 1000;
  c.fillStyle = "#090d16";
  c.fillRect(0, 0, 90, 90);
  let skinId = P.equippedSkin;
  let trailId = P.equippedTrail;
  let targetItem = hoveredShopItem;
  if (!targetItem && P.dealId && $("shopDealContainer").style.display !== "none") {
    const dealItem = SHOP.find(x => x.id === P.dealId);
    if (dealItem && (dealItem.type === "skins" || dealItem.type === "trails")) {
      targetItem = dealItem;
    }
  }
  if (targetItem) {
    if (targetItem.type === "skins") skinId = targetItem.id;
    if (targetItem.type === "trails") trailId = targetItem.id;
    $("previewName").textContent = targetItem.name;
    $("previewName").style.color = targetItem.color;
    $("previewDesc").textContent = targetItem.desc;
    const tier = getShopItemTier(targetItem);
    const tierBadge = $("previewTier");
    tierBadge.textContent = tier.toUpperCase();
    tierBadge.className = "";
    tierBadge.style.color = tier === "legendary" ? "var(--warn)" : tier === "epic" ? "#d946ef" : tier === "rare" ? "#5db9ff" : "var(--dim)";
    tierBadge.style.background = tier === "legendary" ? "rgba(255,154,61,0.08)" : tier === "epic" ? "rgba(217,70,239,0.08)" : tier === "rare" ? "rgba(93,185,255,0.08)" : "rgba(255,255,255,0.05)";
    tierBadge.style.border = "1px solid " + (tier === "legendary" ? "rgba(255,154,61,0.2)" : tier === "epic" ? "rgba(217,70,239,0.2)" : tier === "rare" ? "rgba(93,185,255,0.2)" : "rgba(255,255,255,0.05)");
  } else {
    $("previewName").textContent = "Equipped";
    $("previewName").style.color = "var(--hunger)";
    $("previewDesc").textContent = "Hover over any item in the lab to inspect.";
    $("previewTier").textContent = "ACTIVE";
    $("previewTier").style.color = "var(--food)";
    $("previewTier").style.background = "rgba(124,255,107,0.08)";
    $("previewTier").style.border = "1px solid rgba(124,255,107,0.2)";
  }
  const skin = SHOP.find(x => x.id === skinId);
  const skinColor = skin ? skin.color : "#00f5d4";
  previewMote.x = 45 + Math.cos(t * 3.0) * 22;
  previewMote.y = 45 + Math.sin(t * 6.0) * 10;
  const lastX = 45 + Math.cos((t - 0.016) * 3.0) * 22;
  const lastY = 45 + Math.sin((t - 0.016) * 6.0) * 10;
  previewMote.faceA = Math.atan2(previewMote.y - lastY, previewMote.x - lastX);
  if (trailId && trailId !== "trail_none" && Math.random() < 0.6) {
    const td = SHOP.find(x => x.id === trailId);
    if (td) {
      previewTrailParts.push({
        x: previewMote.x - Math.cos(previewMote.faceA) * 10,
        y: previewMote.y - Math.sin(previewMote.faceA) * 10,
        vx: rand(-0.3, 0.3),
        vy: rand(-0.3, 0.3),
        r: rand(1.2, 3),
        c: td.color,
        life: 1.0,
        decay: 1.8
      });
    }
  }
  for (let i = previewTrailParts.length - 1; i >= 0; i--) {
    const p = previewTrailParts[i];
    p.x += p.vx; p.y += p.vy;
    p.life -= p.decay * 0.016;
    if (p.life <= 0) {
      previewTrailParts.splice(i, 1);
      continue;
    }
    c.globalAlpha = p.life;
    c.fillStyle = p.c;
    c.beginPath();
    c.arc(p.x, p.y, p.r * p.life, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1.0;
  c.save();
  c.translate(previewMote.x, previewMote.y);
  c.rotate(previewMote.faceA);
  c.beginPath();
  c.moveTo(-8, 0);
  c.lineWidth = 2.5;
  c.strokeStyle = shade(skinColor, 0.55);
  c.lineCap = "round";
  c.lineJoin = "round";
  for (let i = 1; i <= 6; i++) {
    const ratio = i / 6;
    const lx = -8 - ratio * 12;
    const wiggle = 3 * Math.sin(t * 16 - i * 0.8);
    c.lineTo(lx, wiggle);
  }
  c.stroke();
  c.save(); c.rotate(t * 0.35);
  c.fillStyle = shade(skinColor, 0.62);
  const ns = 6;
  for (let i = 0; i < ns; i++) {
    const a = i / ns * TAU;
    const L = 14 * (1.1 + 0.07 * Math.sin(t * 5 + i * 2));
    c.beginPath();
    c.moveTo(Math.cos(a - 0.16) * 12, Math.sin(a - 0.16) * 12);
    c.lineTo(Math.cos(a) * L, Math.sin(a) * L);
    c.lineTo(Math.cos(a + 0.16) * 12, Math.sin(a + 0.16) * 12);
    c.closePath(); c.fill();
  }
  c.restore();
  c.beginPath();
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = i / n * TAU;
    const rr = 12 * (1 + 0.06 * Math.sin(t * 4.5 + i * 1.9));
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath();
  c.fillStyle = skinColor;
  c.fill();
  c.lineWidth = 1.2;
  c.strokeStyle = shade(skinColor, 0.55);
  c.stroke();
  c.fillStyle = "#fff";
  c.beginPath(); c.arc(3, -2, 2.5, 0, TAU); c.fill();
  c.fillStyle = "#1a0d1f";
  c.beginPath(); c.arc(4, -2, 1.3, 0, TAU); c.fill();
  c.restore();
}

/* ---------------- achievements: 100, generated ---------------- */
const ACH = [];
(function buildAch(){
  const add = (id,icon,name,desc,reward,test)=>ACH.push({id,icon,name,desc,reward,test});
  EVOS.forEach((e,i)=>{ if(i>0) add("evo"+i,"🧬","Become "+e.name,"Reach evolution "+(i+1)+" of 20",8+i*3,st=>st.maxEvoRun>=i); });               // 19
  [5,10,15,25,40,60,80,100,150,200].forEach((c,i)=>add("combo"+c,"🔥",c+" Chain","Reach a x"+c+" combo",6+i*4,st=>st.bestCombo>=c));            // 10
  [500,2e3,5e3,1e4,2e4,4e4,8e4,1.5e5,3e5,6e5].forEach((s,i)=>add("score"+i,"🏆",fmtInt(s)+" Points","Score "+fmtInt(s)+" in one run",6+i*5,st=>st.score>=s)); // 10
  [25,100,300,800,2000,5000,1e4,2.5e4,5e4,1e5].forEach((n,i)=>add("eat"+i,"🍽️","Devour "+fmtInt(n),"Consume "+fmtInt(n)+" objects (lifetime)",6+i*5,st=>P.totalEaten>=n)); // 10
  BOSSES.forEach((b,i)=>add("boss"+i,"💀","Slay "+b.name.split(" ").map(w=>w[0]+w.slice(1).toLowerCase()).join(" "),"Defeat boss "+(i+1)+" of 10",15+i*5,st=>st.bossKilled[i])); // 10
  WORLDS.forEach(w=>add("world_"+w.id,"🌍","Tour: "+w.name,"Finish a run in "+w.name,20,st=>st.world===w.id&&st.runOver));                       // 5
  [60,120,240,360,600,900,1200,1800,2700,3600].forEach((t,i)=>add("time"+i,"⏱️",fmtTime(t)+" Survivor","Survive "+fmtTime(t)+" in one run",6+i*4,st=>st.time>=t)); // 10
  [1,3,5,10,20,35,50,75,100,200].forEach((r,i)=>add("runs"+i,"🔁",r+(r>1?" Runs":" Run"),"Finish "+r+" runs",5+i*4,()=>P.runs>= r));            // 10
  [3,6,10,15,20,30,40,60,80,120].forEach((u,i)=>add("ups"+i,"⬆️",u+" Mutations","Pick "+u+" upgrades (lifetime)",5+i*3,()=>P.totalUpgrades>=u)); // 10
  add("victory","🌌","Universe Eater","Consume the universe",250,st=>st.victory);
  add("flawless","😇","Untouchable","Reach evolution 6 without taking damage",60,st=>st.maxEvoRun>=5&&st.damageTaken===0);
  add("speedrun","🐇","Fast Food","Reach evolution 10 within 5 minutes",80,st=>st.maxEvoRun>=9&&st.time<=300);
  add("legend1","🎴","Mythic Taste","Pick a Legendary upgrade",40,st=>st.legendPicked);
  add("hoard","💰","Hoarder","Hold 1,000 essence at once",60,()=>P.essence>=1000);
  add("closet","🎨","Identity Crisis","Own 5 skins",40,()=>Object.keys(P.owned).filter(k=>k.startsWith("skin_")).length>=5);
  // total: 19+10+10+10+10+5+10+10+10+6 = 100
})();

/* ============================================================
   AUDIO — fully synthesized with Web Audio API
============================================================ */
const AudioSys = (() => {
  let ctx = null, master, musicGain, sfxGain, started = false, musicTimer = null;
  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.connect(master);
      applyVolumes();
      return true;
    } catch (e) { return false; }
  }
  function applyVolumes() {
    if (!ctx) return;
    const isMuted = !!P.settings.muted;
    master.gain.value = isMuted ? 0 : (P.settings.master / 100) * 0.9;
    musicGain.gain.value = isMuted ? 0 : Math.pow(P.settings.music / 100, 1.4) * 0.5;
    sfxGain.gain.value = isMuted ? 0 : Math.pow(P.settings.sfx / 100, 1.2);
  }
  function unlock() { if (!ensure()) return; if (ctx.state === "suspended") ctx.resume(); if (!started) { started = true; startMusic(); } }

  function env(node, t0, a, peak, d, end) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    node.gain.exponentialRampToValueAtTime(Math.max(end, 0.0001), t0 + a + d);
  }
  function blip(freq, type, peak, dur, slideTo, when) {
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 20), t + dur);
    env(g, t, 0.005, peak, dur, 0.0001);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(peak, dur, freq, q, when) {
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain(); env(g, t, 0.003, peak, dur, 0.0001);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t);
  }
  // --- sfx ---
  const SFX = {
    eat(sizeRatio, combo) {        // juicy pop, pitch scales with prey size and combo
      if (!ctx) return;
      const base = clamp(520 - sizeRatio * 260, 140, 760) * (1 + Math.min(combo, 30) * 0.012);
      blip(base, "sine", 0.5, 0.09, base * 0.45);
      noise(0.22, 0.06, 1200, 2);
    },
    bigEat() { blip(180, "sine", 0.7, 0.22, 60); noise(0.4, 0.18, 420, 1.2); },
    crunch() { noise(0.5, 0.16, 700, 0.8); blip(95, "square", 0.25, 0.14, 40); },
    hurt() { blip(160, "sawtooth", 0.55, 0.22, 55); noise(0.35, 0.2, 240, 1); },
    levelup() { [440, 554, 659, 880].forEach((f, i) => blip(f, "triangle", 0.4, 0.18, null, i * 0.07)); },
    pick() { blip(660, "triangle", 0.4, 0.12, 990); },
    evolve() {
      [220, 277, 330, 440, 554, 660, 880].forEach((f, i) => blip(f, "sawtooth", 0.22, 0.3, null, i * 0.06));
      noise(0.4, 0.7, 600, 0.6, 0.1);
      blip(55, "sine", 0.6, 0.9, 30, 0.05);
    },
    combo(step) { blip(520 + Math.min(step, 40) * 26, "square", 0.3, 0.1, null); },
    shock() { blip(70, "sine", 0.8, 0.5, 28); noise(0.5, 0.4, 300, 0.8); },
    bossRoar() { blip(80, "sawtooth", 0.7, 1.0, 35); blip(120, "square", 0.4, 0.9, 50, 0.05); noise(0.5, 0.8, 200, 0.7); },
    bossSting() { // minor-chord stab announcing the fight
      [110, 130.8, 164.8].forEach((f, i) => { blip(f, "sawtooth", 0.34, 0.7, null, i * 0.04); blip(f * 2, "triangle", 0.16, 0.5, null, 0.12 + i * 0.04); });
      noise(0.3, 0.6, 500, 0.8, 0.05);
    },
    bossHit() { noise(0.3, 0.08, 900, 1.5); blip(220, "square", 0.2, 0.07, 120); },
    bossDie() { for (let i = 0; i < 6; i++) { noise(0.5, 0.3, 300 + i * 150, 1, i * 0.09); blip(160 - i * 18, "sawtooth", 0.4, 0.35, 40, i * 0.09); } },
    death() { blip(300, "sawtooth", 0.6, 1.4, 40); noise(0.5, 1.0, 200, 0.8, 0.1); },
    victory() { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => blip(f, "triangle", 0.4, 0.5, null, i * 0.13)); },
    ui() { blip(880, "sine", 0.18, 0.06); },
    shard() { blip(1320, "sine", 0.25, 0.08, 1760); }
  };

  /* --- generative music with a distinct identity per scale band --- */
  /* one scale per band: Petri, Underfoot, Streets, Skyline, Orbit, Deep Void */
  const SCALES = [[0,3,5,7,10],[0,2,3,7,8],[0,3,7,10,14],[0,2,5,7,9],[0,2,4,7,9],[0,1,3,7,8]];
  const BAND_ROOTS = [55, 65.41, 58.27, 49.00, 43.65, 38.89];
  /* signature 8-step motif per band (scale-degree index or null = rest) —
     played every other bar so each band is recognizable, not repetitive */
  const BAND_MOTIFS = [
    [0, null, 2, null, 1, null, 3, null],     // Petri: sparse, curious drips
    [0, 0, null, 2, null, 1, null, null],     // Underfoot: scuttling double-tap
    [0, 2, 4, 2, 0, null, 3, null],           // Streets: restless runs
    [4, null, 3, 2, null, 0, 2, null],        // Skyline: soaring descent
    [0, null, null, 4, null, null, 2, null],  // Orbit: weightless intervals
    [0, null, 1, null, 0, null, 1, 0]         // Deep Void: ominous half-step sway
  ];
  /* lead voice timbre per band: FM ratio, modulation depth, note length */
  const BAND_TIMBRE = [
    { ratio: 2.0, mod: 2.2, dur: 0.30 },  // soft, watery
    { ratio: 3.0, mod: 1.6, dur: 0.22 },  // chitinous pluck
    { ratio: 2.0, mod: 3.4, dur: 0.24 },  // electric buzz
    { ratio: 1.5, mod: 2.8, dur: 0.34 },  // brassy
    { ratio: 4.0, mod: 1.2, dur: 0.50 },  // glassy, airy
    { ratio: 0.5, mod: 3.0, dur: 0.60 }   // dark, hollow
  ];
  const BOSS_MOTIF = [0, null, 1, 0, null, 1, null, 1]; // relentless half-step hammering
  let beat = 0;
  let lastMelodyNote = 5;

  function playLeadNote(freq, dur, t, timbre) {
    if (!ctx) return;
    const tb = timbre || BAND_TIMBRE[0];
    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const modGain = ctx.createGain();
    const ampGain = ctx.createGain();

    carrier.type = "sine";
    modulator.type = "sine";
    modulator.frequency.setValueAtTime(freq * tb.ratio, t);
    carrier.frequency.setValueAtTime(freq, t);

    // combo feeds aggression into the lead voice
    const comboBonus = (typeof G !== "undefined" && G.combo > 5) ? Math.min(G.combo, 20) * 0.4 : 0;
    const modPeak = freq * (tb.mod + comboBonus);

    env(modGain, t, 0.008, modPeak, dur * 0.6, 0.0001);
    env(ampGain, t, 0.012, 0.12, dur, 0.0001);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(ampGain);
    ampGain.connect(musicGain);

    modulator.start(t);
    carrier.start(t);
    modulator.stop(t + dur + 0.05);
    carrier.stop(t + dur + 0.05);
  }
  /* percussion for the boss theme, routed through musicGain */
  function musicNoise(peak, dur, freq, q, t) {
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain(); env(g, t, 0.003, peak, dur, 0.0001);
    src.connect(f); f.connect(g); g.connect(musicGain);
    src.start(t);
  }
  function musicKick(t, root) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(Math.max(root * 1.5, 50), t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.16);
    env(g, t, 0.004, 0.5, 0.18, 0.0001);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.25);
  }

  function startMusic() {
    if (musicTimer) return;
    const tick = () => {
      if (!ctx || ctx.state !== "running") return;
      
      const inPlay = (typeof G !== "undefined" && G.state === "play");
      const intensity = inPlay ? G.evoIndex / 19 : 0.08;
      
      // Select base root frequency and scale based on active scale band
      let bandIdx = 0;
      if (inPlay && typeof bandFor === "function") {
        const band = bandFor(G.evoIndex || 0);
        bandIdx = BANDS.indexOf(band);
        if (bandIdx < 0) bandIdx = 0;
      }
      const baseRoot = BAND_ROOTS[bandIdx];
      const scale = SCALES[Math.min(SCALES.length - 1, bandIdx)];
      const timbre = BAND_TIMBRE[Math.min(BAND_TIMBRE.length - 1, bandIdx)];
      const inBoss = inPlay && !!G.boss;
      const finalBoss = inBoss && G.boss.def && G.boss.def.final;

      // chord progression: zen drifts, bosses grind on the half-step, bands ride minor
      let progression = [0, 3, 7, 5];
      if (inPlay && G.mode === "zen") progression = [0, 5, 7, 9];
      else if (inBoss) progression = [0, 1, 0, -2];

      const chordIdx = Math.floor(beat / 4) % 4;
      const root = baseRoot * Math.pow(2, progression[chordIdx] / 12);
      const t = ctx.currentTime;
      const stepInBar = beat % 4;
      const motifStep = beat % 8;
      const motifBar = Math.floor(beat / 8) % 2 === 0; // motif bar, then improvised bar

      // 1. bass — steady pulse normally; driving ostinato during boss fights
      if (inBoss) {
        const bassStep = [0, 0, 1, 0][stepInBar]; // root-root-b2-root grind
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "triangle";
        o.frequency.value = root * Math.pow(2, bassStep / 12);
        env(g, t, 0.01, 0.4, 0.22, 0.0001);
        o.connect(g); g.connect(musicGain);
        o.start(t); o.stop(t + 0.3);
      } else if (beat % 2 === 0) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = root;
        env(g, t, 0.015, 0.45, 0.45, 0.0001);
        o.connect(g); g.connect(musicGain);
        o.start(t); o.stop(t + 0.5);
      }

      // 2. boss percussion — kick on the downbeats, hats driving over the top
      if (inBoss) {
        if (stepInBar === 0 || stepInBar === 2) musicKick(t, root);
        musicNoise(0.06, 0.03, 6500, 2, t);
        if (finalBoss) musicNoise(0.05, 0.025, 8000, 2, t + 0.5 * 0.001); // double feel for the finale
      }

      // 3. lead — the band's signature motif on motif bars, improvisation between
      if (inBoss) {
        const deg = BOSS_MOTIF[motifStep];
        if (deg !== null) {
          const noteOffset = scale[deg % scale.length] + 12;
          playLeadNote(root * Math.pow(2, noteOffset / 12), 0.16, t, { ratio: 2, mod: 4.2, dur: 0.16 });
        }
      } else if (motifBar) {
        const motif = BAND_MOTIFS[Math.min(BAND_MOTIFS.length - 1, bandIdx)];
        const deg = motif[motifStep];
        if (deg !== null) {
          const noteOffset = scale[deg % scale.length] + 12 * (1 + Math.floor(deg / scale.length));
          playLeadNote(root * Math.pow(2, noteOffset / 12), timbre.dur, t, timbre);
        }
      } else {
        const playProb = (stepInBar === 0) ? 0.9 : (stepInBar === 2 ? 0.7 : 0.45);
        if (Math.random() < playProb + intensity * 0.15) {
          let noteOffset;
          if (stepInBar === 0) noteOffset = scale[0] + 12;
          else {
            lastMelodyNote = clamp(lastMelodyNote + pick([-2, -1, 1, 2]), 0, scale.length * 2 - 1);
            noteOffset = scale[lastMelodyNote % scale.length] + 12 * (Math.floor(lastMelodyNote / scale.length) + 1);
          }
          playLeadNote(root * Math.pow(2, noteOffset / 12), timbre.dur, t, timbre);
          if ((stepInBar === 2 || stepInBar === 3) && Math.random() < 0.35 + intensity * 0.25) {
            playLeadNote(root * Math.pow(2, (noteOffset + pick([-2, 2, 3])) / 12), timbre.dur * 0.5, t + 0.15, timbre);
          }
        }
      }

      // 4. airy ambient pad every 8 beats (rests during boss fights)
      if (!inBoss && beat % 8 === 0) {
        const f = root * 2 * Math.pow(2, pick(scale) / 12);
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = f;
        env(g, t, 0.5, 0.07, 2.8, 0.0001);
        o.connect(g); g.connect(musicGain);
        o.start(t); o.stop(t + 3.5);
      }

      beat++;
    };
    const loop = () => {
      tick();
      // Speeds up tempo based on evolution stage and boss fight states
      const inPlay = (typeof G !== "undefined" && G.state === "play");
      const intensity = inPlay ? G.evoIndex / 19 : 0;
      const speedUp = inPlay && G.boss ? (G.boss.def && G.boss.def.final ? 0.45 : 0.25) : 0;
      const stepDuration = Math.max(150, 310 - (intensity + speedUp) * 115);
      musicTimer = setTimeout(loop, stepDuration);
    };
    loop();
  }
  return { unlock, applyVolumes, SFX, blip, get ready() { return !!ctx; } };
})();
const SFX = new Proxy({}, { get: (_, k) => (...a) => { try { if (AudioSys.ready) AudioSys.SFX[k](...a); } catch (e) {} } });

/* ============================================================
   PERFORMANCE — glow sprite cache + adaptive quality governor
============================================================ */
/* Radial gradients are expensive to build every frame (late game is ~100 glow
   objects + auras per frame on a phone GPU). Render each glow color once to a
   small offscreen sprite, then drawImage it scaled — orders of magnitude cheaper. */
const GlowCache = (() => {
  const cache = new Map();
  function transparent(color) {
    if (color[0] === "#") return hexA(color, 0);
    if (color.startsWith("hsl(")) return color.replace("hsl(", "hsla(").replace(")", ",0)");
    return "rgba(0,0,0,0)";
  }
  return function sprite(color) {
    let s = cache.get(color);
    if (!s) {
      s = document.createElement("canvas");
      s.width = s.height = 64;
      const g = s.getContext("2d");
      const rg = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      rg.addColorStop(0, color);
      rg.addColorStop(0.55, color);
      rg.addColorStop(1, transparent(color));
      g.fillStyle = rg;
      g.beginPath(); g.arc(32, 32, 32, 0, TAU); g.fill();
      cache.set(color, s);
      if (cache.size > 128) { cache.delete(cache.keys().next().value); }
    }
    return s;
  };
})();
/* draw a soft glow centered at (x, y); call inside the current transform */
function drawGlow(c, color, x, y, r, alpha) {
  c.globalAlpha = alpha;
  c.drawImage(GlowCache(color), x - r, y - r, r * 2, r * 2);
  c.globalAlpha = 1;
}

/* Watches real frame times and steps render quality down when the device
   struggles (and back up when it recovers) so the game never lags on phones. */
const Quality = {
  level: 0, acc: 0, n: 0, cool: 0,
  dprCap() { return [2, 1.5, 1.25, 1][this.level]; },
  partCap() { return [520, 340, 220, 140][this.level]; },
  sample(rawDt) {
    if (rawDt > 0.25 || rawDt <= 0) return; // backgrounded tab / clock jump
    this.acc += rawDt; this.n++;
    this.cool -= rawDt;
    if (this.n >= 60) {
      const avg = this.acc / this.n;
      this.acc = 0; this.n = 0;
      if (this.cool <= 0) {
        if (avg > 0.024 && this.level < 3) { this.level++; this.cool = 3; resize(); }
        else if (avg < 0.014 && this.level > 0) { this.level--; this.cool = 8; resize(); }
      }
    }
  }
};

/* ============================================================
   FX — particles, floating text, screen shake, hit-stop
============================================================ */
const FX = {
  parts: [], texts: [], rings: [],
  shake: 0, hitstop: 0, flash: 0,
  cap() { return Math.min(P.settings.perf ? 160 : (P.settings.reduced ? 220 : 520), Quality.partCap()); },
  burst(x, y, color, n, speed, size, life) {
    if (P.settings.reduced) n = Math.ceil(n * 0.4);
    if (P.settings.perf) n = Math.ceil(n * 0.55);
    for (let i = 0; i < n; i++) {
      if (this.parts.length > this.cap()) { this.parts.shift(); }
      const a = Math.random() * TAU, sp = speed * rand(0.3, 1);
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: size * rand(0.5, 1.3), c: color, life: 1, decay: 1 / (life || 0.6), grav: 0 });
    }
  },
  ring(x, y, r, color, w) { this.rings.push({ x, y, r: r * 0.3, max: r, c: color, life: 1, w: w || 3 }); },
  text(x, y, str, color, scale) {
    if (this.texts.length > 24) this.texts.shift();
    this.texts.push({ x, y, str, c: color || "#fff", life: 1, vy: -1.4, s: scale || 1 });
  },
  addShake(amt) { if (P.settings.shake) this.shake = Math.min(this.shake + amt, 38); },
  addHitstop(t) { if (!P.settings.reduced) this.hitstop = Math.max(this.hitstop, t); },
  update(dt) {
    this.shake *= Math.pow(0.0018, dt);
    if (this.shake < 0.2) this.shake = 0;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.x += p.vx * dt * 60; p.y += p.vy * dt * 60;
      p.vx *= 0.92; p.vy *= 0.92; p.vy += p.grav * dt * 60;
      p.life -= p.decay * dt;
      if (p.life <= 0) this.parts.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.y += t.vy * dt * 60 * 0.6; t.life -= dt * 0.85;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.r = lerp(r.r, r.max, 1 - Math.pow(0.002, dt)); r.life -= dt * 1.8;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
  },
  clear() { this.parts.length = 0; this.texts.length = 0; this.rings.length = 0; this.shake = 0; this.hitstop = 0; }
};

/* ============================================================
   GAME STATE
============================================================ */
const canvas = $("game");
const ctx2d = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = P.settings.perf ? 1 : Math.min(window.devicePixelRatio || 1, Quality.dprCap());
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  ctx2d.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resize);

const G = {
  state: "menu", // menu | play | pause | over | victory
  player: null, objs: [], shots: [], boss: null,
  evoIndex: 0, level: 1, xp: 0, xpNeed: 14,
  score: 0, combo: 0, comboT: 0, bestCombo: 0,
  eaten: 0, time: 0, world: WORLDS[0],
  stats: null, run: null, lastSpawn: 0, ambient: [],
  victoryCore: null, slowmoT: 0, event: null, eventT: 0
};

const INPUT = { x: 0, y: 0, active: false };
function setPointer(e) {
  const t = e.touches ? e.touches[0] : e;
  if (!t) return;
  INPUT.x = t.clientX; INPUT.y = t.clientY;
}
function triggerManualDash() {
  if (G.state !== "play" || !G.player || G.run.runOver) return;
  if (G.player.manualDashCd > 0) return;
  if (G.tut) G.tut.dashed = true;
  G.player.manualDashCd = 1.5;
  G.player.targetR = Math.max(EVOR[0] * 0.5, G.player.targetR * 0.98);
  G.player.dashT = 0.35;
  G.player.iframe = Math.max(G.player.iframe, 0.35);
  SFX.ui();
  AudioSys.blip(140, "sine", 0.8, 0.28, 540);
  FX.ring(G.player.x, G.player.y, G.player.r * 2.8, "#00f5d4", 3);
  for (let i = 0; i < 15; i++) {
    const ang = G.player.faceA + Math.PI + rand(-0.6, 0.6);
    const sp = G.player.r * rand(0.5, 1.2);
    FX.parts.push({
      x: G.player.x - Math.cos(G.player.faceA) * G.player.r * 0.8,
      y: G.player.y - Math.sin(G.player.faceA) * G.player.r * 0.8,
      vx: Math.cos(ang) * sp * 3.5,
      vy: Math.sin(ang) * sp * 3.5,
      r: G.player.r * rand(0.08, 0.16),
      c: "#00f5d4",
      life: 0.7,
      decay: 1.6,
      grav: 0
    });
  }
}
window.addEventListener("pointermove", e => { setPointer(e); INPUT.active = true; });
window.addEventListener("pointerdown", e => { setPointer(e); INPUT.active = true; AudioSys.unlock(); });
let lastTap = 0;
window.addEventListener("touchstart", e => {
  setPointer(e);
  INPUT.active = true;
  AudioSys.unlock();
  const now = Date.now();
  if (now - lastTap < 280) triggerManualDash();
  lastTap = now;
}, { passive: true });
window.addEventListener("touchmove", e => { setPointer(e); if (G.state === "play") e.preventDefault(); }, { passive: false });
window.addEventListener("contextmenu", e => {
  if (G.state === "play") {
    e.preventDefault();
    triggerManualDash();
  }
});

/* ---------------- run stats (defaults + perks) ---------------- */
function newRunStats() {
  const s = {
    speed: 1, accel: 1, magnet: 1, magnetPull: 1, xpMult: 1, growMult: 1, scoreMult: 1,
    biteSize: 0, reach: 1, comboTime: 3.2, comboBonus: 0, regen: 0.8, armor: 1, bigArmor: 1,
    maxHp: 100, hp: 100, eatHeal: 0, frenzySpeed: 0, shockEvery: 0, shockSize: 1, doubleChance: 0,
    bossDmg: 1, evoSpeed: 0, thorns: 0, dashEvery: 0, iframes: 1.0, shardChance: 0, shardValue: 1,
    evoHeal: false, enemyShards: 1, hitstopMult: 1, zoomOut: 1, rageOnHit: false, feastGrow: false,
    undertow: false, xpNeedMult: 1, chainBite: 0, cheatDeath: 0, timeSlow: 1, choices: 3,
    afterburn: false, bossHeal: 0, heal: 0, instaGrow: 0, legendOdds: 1, essenceMult: 1
  };
  const pk = id => P.owned[id];
  if (pk("perk_legs")) s.speed *= 1.08;
  if (pk("perk_gut")) s.magnet *= 1.10;
  if (pk("perk_skin")) s.armor *= 0.90;
  if (pk("perk_brain")) s.xpMult *= 1.10;
  if (pk("perk_heart")) { s.maxHp += 20; }
  if (pk("perk_greed")) s.essenceMult *= 1.15;
  if (pk("perk_combo")) s.comboTime += 0.5;
  if (pk("perk_boss")) s.bossDmg *= 1.2;
  if (pk("perk_lucky")) s.legendOdds = 2;
  if (pk("perk_magnet2")) s.magnet *= 1.15;
  if (pk("perk_growth")) s.growMult *= 1.08;
  if (pk("perk_revive")) s.cheatDeath = 1;
  if (pk("perk_reroll")) s.choices += 2;
  s.hp = s.maxHp;
  return s;
}

let selectedMode = "standard";

function startRun() {
  G.world = WORLDS.find(w => w.id === P.world) || WORLDS[0];
  G.mode = selectedMode || "standard";
  G.rushBossIndex = 0;
  G.endlessCycle = 0;
  G.stats = newRunStats();

  let startMutations = 0;
  if (G.mode === "rush") {
    G.evoIndex = 10;
    G.level = 10;
    startMutations = 5;
  } else {
    G.evoIndex = 0;
    G.level = 1;
  }

  const startR = EVOR[G.evoIndex] * (P.owned["perk_head"] ? 1.15 : 1);
  G.player = {
    x: 0, y: 0, vx: 0, vy: 0, r: startR, targetR: startR,
    mouth: 0, blink: 0, iframe: 0, hurtT: 0, rageT: 0, dashT: 0,
    eatCount: 0, shockCount: 0, dashCount: 0, faceA: 0, wob: Math.random() * 9,
    manualDashCd: 0
  };
  G.objs = []; G.shots = []; G.boss = null; G.bossPending = false; G.bossGeneration = (G.bossGeneration || 0) + 1; G.victoryCore = null; G.fusions = { spikeStorm: false, gravitySlipstream: false, ironClad: false, reaverRage: false }; G.playerShots = []; G.gravityTrails = [];
  G.xp = 0;
  G.xpNeed = Math.floor(16 * Math.pow(G.level, 1.45) * G.stats.xpNeedMult);
  G.score = 0; G.combo = 0; G.comboT = 0; G.bestCombo = 0;
  G.eaten = 0; G.time = 0; G.slowmoT = 0; G.upCount = 0;
  G.event = null; G.eventT = rand(22, 38);
  if (P.owned["perk_start2"] && G.mode !== "rush") {
    startMutations = 1;
    G.level = 2;
    G.xpNeed = Math.floor(16 * Math.pow(G.level, 1.45) * G.stats.xpNeedMult);
  }
  G.run = { maxEvoRun: G.evoIndex, bestCombo: 0, score: 0, time: 0, bossKilled: {}, world: G.world.id, runOver: false, victory: false, damageTaken: 0, legendPicked: false, diet: { blob: 0, rect: 0, poly: 0, glow: 0 } };
  runUpgradeCounts = {};
  FX.clear();
  for (let i = 0; i < 26; i++) spawnObject(true);
  buildAmbient();
  show("hud"); hideAll(["menuScreen","pauseScreen","gameOverScreen","victoryScreen","worldsScreen","shopScreen","achScreen","settingsScreen"]);
  $("hint").style.display = "";
  setTimeout(() => { $("hint").style.display = "none"; }, 6000);
  G.state = "play";
  for (let i = 0; i < startMutations; i++) autoMutateOne();
  if (!P.tutorialDone) tutStart();
  else { G.tut = null; hide("tutChip"); }
  checkBossSpawn();
  refreshHud(true);
  lastT = performance.now() / 1000;
}

/* ---------------- spawning ---------------- */
function viewRadius() {
  const z = camZoom();
  return Math.hypot(W, H) / (2 * z);
}
function camZoom() {
  if (!G.player) return 1;
  return clamp((Math.min(W, H) * 0.10) / G.player.r, 0.00012, 8) / (G.stats ? G.stats.zoomOut : 1);
}
function tierName(tier, idx) {
  const sk = G.world.skin;
  if (sk && sk[tier]) return sk[tier][idx];
  return CONSUMABLES[tier][idx][0];
}
function spawnObject(initial) {
  const maxObjs = P.settings.perf ? 80 : 130;
  if (G.objs.length >= maxObjs) return;
  const p = G.player;
  const stage = G.evoIndex;
  const roll = Math.random();
  let tier = stage + (roll < 0.42 ? 0 : roll < 0.66 ? -1 : roll < 0.90 ? 1 : 2);
  if (G.mode === "zen") {
    tier = Math.min(tier, G.evoIndex);
  }
  tier = clamp(tier, 0, 19);
  const isEnemy = G.mode === "zen" ? false : Math.random() < (0.13 + stage * 0.004) && G.time > 6;
  let def, name, color, shape, ai = null;
  if (isEnemy) {
    const idx = randi(0, 1);
    def = ENEMIES[tier][idx];
    name = def[0]; ai = def[1]; color = def[2] || "#ff6a6a"; shape = "blob";
  } else {
    const idx = randi(0, 4);
    def = CONSUMABLES[tier][idx];
    name = tierName(tier, idx); shape = def[1]; color = def[2];
  }
  let sizeScale = 1.0;
  if (G.mode === "endless" && p.r > EVOR[19]) {
    sizeScale = p.r / EVOR[19];
  }
  const base = EVOR[tier] * sizeScale;
  let r;
  if (tier <= stage) r = base * rand(0.42, 0.92);                 // edible-ish
  else r = base * rand(0.7, 1.05);                                 // threats
  if (tier === stage && Math.random() < 0.25) r = base * rand(0.95, 1.25); // near-peers
  const ang = Math.random() * TAU;
  const d = initial ? viewRadius() * rand(0.25, 1.0) : viewRadius() * rand(1.15, 1.9);
  const o = {
    x: p.x + Math.cos(ang) * d, y: p.y + Math.sin(ang) * d,
    vx: 0, vy: 0, r, name, color, shape, tier, ai,
    a: Math.random() * TAU, spin: rand(-0.4, 0.4), wob: Math.random() * 9,
    hp: isEnemy ? r * 0.4 : 0, fireT: rand(1, 3), dartT: rand(0.6, 2), wx: rand(-1, 1), wy: rand(-1, 1), stun: 0
  };
  if (initial && dist2(o.x, o.y, p.x, p.y) < (p.r * 4) ** 2 && o.r > p.r) { o.x += viewRadius(); }
  G.objs.push(o);
}
function spawnShard(x, y, val) {
  G.objs.push({ x, y, vx: rand(-3, 3), vy: rand(-3, 3), r: G.player.r * 0.18, name: "Shard", color: "#7cff6b",
    shape: "shard", tier: G.evoIndex, ai: null, a: 0, spin: 2, wob: Math.random() * 9, hp: 0, shardVal: val, life: 9 });
}

/* ---------------- world events ---------------- */
function startWorldEvent() {
  const type = G.mode === "zen" ? "golden" : pick(["golden", "golden", "meteor"]);
  if (type === "golden") {
    G.event = { type, t: 12 };
    toast("A <b>Golden Swarm</b> drifts by — gold is worth triple", "gold", "Event");
    SFX.levelup();
    const p = G.player, vr = viewRadius();
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU, dd = vr * rand(0.45, 1.15);
      G.objs.push({ x: p.x + Math.cos(a) * dd, y: p.y + Math.sin(a) * dd,
        vx: rand(-1, 1) * p.r * 0.25, vy: rand(-1, 1) * p.r * 0.25,
        r: p.r * rand(0.22, 0.42), name: "Golden Mote", color: "#ffd04a", shape: "blob", tier: G.evoIndex,
        ai: null, a: 0, spin: rand(-0.5, 0.5), wob: Math.random() * 9, hp: 0, golden: true,
        fireT: 0, dartT: 0, wx: 0, wy: 0, stun: 0 });
    }
  } else {
    G.event = { type, t: 9, spawnT: 0.4 };
    toast("<b>Meteor Storm</b> inbound — dodge the debris", "danger", "Event");
    SFX.crunch();
    FX.addShake(8);
  }
}
function spawnMeteor() {
  const p = G.player, vr = viewRadius();
  const a = Math.random() * TAU;
  const sx = p.x + Math.cos(a) * vr * 1.35, sy = p.y + Math.sin(a) * vr * 1.35;
  const tx = p.x + rand(-0.55, 0.55) * vr, ty = p.y + rand(-0.55, 0.55) * vr;
  const dd = Math.max(1, Math.hypot(tx - sx, ty - sy));
  const sp = p.r * rand(3.0, 4.0);
  G.shots.push({ x: sx, y: sy, vx: (tx - sx) / dd * sp, vy: (ty - sy) / dd * sp,
    r: p.r * rand(0.2, 0.32), life: 2.8, c: "#ff8a4a", meteor: true, dmg: 12 });
}
/* ---------------- guided first run ----------------
   Contextual, non-blocking objectives shown only until the player has
   completed them once. Replaces the generic hint on the first run. */
const TUT_STEPS = [
  { text: "Drag, or use WASD, to move", test: () => G.tut.moved > G.player.r * 8 },
  { text: "Devour 5 things smaller than you", test: () => G.eaten - G.tut.eats0 >= 5 },
  { text: "Fill the teal bar — mutations choose themselves from your diet", test: () => G.level >= 2 },
  { text: "Press Space, or double-tap, to dash", test: () => G.tut.dashed },
  { text: "Keep eating until you evolve", test: () => G.evoIndex >= 1 || G.mode === "rush" },
  { text: "A rival is coming — bite it once you match its size", needsBoss: true, test: () => G.tut.bossBitten }
];
function tutStart() {
  G.tut = { step: 0, moved: 0, eats0: G.eaten, dashed: false, bossBitten: false, doneT: 0, lastX: null, lastY: 0 };
  $("tutLabel").textContent = "First Hunt · 1/" + TUT_STEPS.length;
  $("tutText").textContent = TUT_STEPS[0].text;
  const chip = $("tutChip");
  chip.classList.remove("hidden", "done");
  $("hint").style.display = "none";
}
function tutUpdate(dt) {
  const T = G.tut;
  if (!T) return;
  const p = G.player;
  if (T.lastX !== null) T.moved += Math.hypot(p.x - T.lastX, p.y - T.lastY);
  T.lastX = p.x; T.lastY = p.y;
  if (T.doneT > 0) {
    T.doneT -= dt;
    if (T.doneT <= 0) {
      T.step++;
      const st = TUT_STEPS[T.step];
      if (!st || (st.needsBoss && G.mode === "zen")) { tutFinish(); return; }
      $("tutChip").classList.remove("done");
      $("tutLabel").textContent = "First Hunt · " + (T.step + 1) + "/" + TUT_STEPS.length;
      $("tutText").textContent = st.text;
    }
    return;
  }
  let ok = false;
  const currentStep = TUT_STEPS[T.step];
  if (!currentStep) { tutFinish(); return; }
  try { ok = currentStep.test(); } catch (e) {}
  if (ok) {
    T.doneT = 0.9;
    $("tutChip").classList.add("done");
    SFX.pick();
  }
}
function tutFinish() {
  G.tut = null;
  P.tutorialDone = true;
  saveP();
  hide("tutChip");
  toast("You know the Hunger now — devour everything", "info", "First Hunt Complete");
}

function updateWorldEvents(dt) {
  if (G.boss) return; // events stay out of boss fights
  if (G.event) {
    G.event.t -= dt;
    if (G.event.type === "meteor") {
      G.event.spawnT -= dt;
      if (G.event.spawnT <= 0 && G.shots.length < 40) {
        G.event.spawnT = 0.55;
        spawnMeteor();
      }
    }
    if (G.event.t <= 0) { G.event = null; G.eventT = rand(38, 65); }
  } else {
    G.eventT -= dt;
    if (G.eventT <= 0 && G.time > 18) startWorldEvent();
  }
}

/* ---------------- boss ---------------- */
function spawnBoss(bdef) {
  if (G.mode === "zen") return;
  SFX.bossRoar();
  SFX.bossSting();
  FX.addShake(20);
  const p = G.player;
  const ang = Math.random() * TAU;
  
  // Scale boss health based on endless cycle (gentle curve so late cycles stay fightable)
  const cycle = G.endlessCycle || 0;
  const scale = 1 + cycle * 0.3;
  const hp = bdef.hp * scale;
  const name = bdef.name + (cycle > 0 ? " +" + cycle : "");
  
  const r = p.r * 1.9;
  G.boss = {
    def: bdef, name: name, color: bdef.color,
    x: p.x + Math.cos(ang) * viewRadius() * 1.2, y: p.y + Math.sin(ang) * viewRadius() * 1.2,
    vx: 0, vy: 0, r, hp: hp, maxHp: hp,
    phase: "stalk", t: 0, telA: 0, wob: Math.random() * 9, hitFlash: 0, summonT: 4, shootT: 2.4,
    phaseIdx: 0, dashesLeft: 0, volley: 0
  };
  $("bossWrap").style.display = "block";
  $("bossName").textContent = name;
  G.slowmoT = Math.max(G.slowmoT || 0, 0.9); // cinematic entrance
  showBossBanner(name, bdef.final);
}
function showBossBanner(name, final) {
  const t = $("bossToast");
  if (!t) return;
  $("bossToastName").textContent = name;
  $("bossToastLabel").textContent = final ? "FINAL HUNGER" : "WARNING";
  t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
}
function bossDamage(amount) {
  const b = G.boss; if (!b) return;
  b.hp -= amount; b.hitFlash = 1;
  SFX.bossHit();
  if (G.stats.bossHeal) G.stats.hp = Math.min(G.stats.maxHp, G.stats.hp + G.stats.bossHeal);
  if (b.hp <= 0) killBoss();
}
function killBoss() {
  const b = G.boss; if (!b) return;
  SFX.bossDie();
  G.slowmoT = Math.max(G.slowmoT || 0, 0.6); // savor the kill
  FX.addShake(34); FX.addHitstop(0.22 * G.stats.hitstopMult); FX.flash = 0.7;
  FX.burst(b.x, b.y, b.color, 80, b.r * 0.05, b.r * 0.08, 1.2);
  FX.burst(b.x, b.y, "#fff", 40, b.r * 0.07, b.r * 0.05, 0.9);
  FX.ring(b.x, b.y, b.r * 4, b.color, 6);
  const idx = BOSSES.indexOf(b.def);
  G.run.bossKilled[idx] = true;
  P.totalBossKills++;
  const reward = Math.floor(b.maxHp * 0.6);
  addScore(reward, b.x, b.y);
  addXp(b.maxHp * 0.35);
  growBy(b.r * 0.4);
  // food explosion
  for (let i = 0; i < 10; i++) spawnShard(b.x + rand(-b.r, b.r), b.y + rand(-b.r, b.r), G.xpNeed * 0.08);
  toast("<b>" + b.name + "</b> devoured · +" + fmtInt(reward) + " score", "success", "Boss Down");
  $("bossWrap").style.display = "none";
  if (G.mode === "rush") {
    G.rushBossIndex = (G.rushBossIndex || 0) + 1;
    G.boss = null;
    checkAch();
    if (G.rushBossIndex >= BOSSES.length) {
      G.victoryCore = { x: b.x, y: b.y, r: G.player.r * 0.8, t: 0 };
      toast("Boss Rush conquered — consume the Core to win", "gold", "Objective");
    } else {
      checkBossSpawn();
    }
    return;
  }
  if (b.def.final) {
    if (G.mode === "endless") {
      G.endlessCycle = (G.endlessCycle || 0) + 1;
      for (let k in G.run.bossKilled) delete G.run.bossKilled[k];
      toast("The ladder begins again — Cycle " + (G.endlessCycle + 1), "info", "Endless");
    } else {
      G.victoryCore = { x: b.x, y: b.y, r: G.player.r * 0.8, t: 0 };
      toast("The <b>Universe Core</b> is exposed — consume it", "gold", "Objective");
    }
  }
  G.boss = null;
  checkAch();
  if (!b.def.final || G.mode === "endless") {
    checkBossSpawn();
  }
}

/* ---------------- scoring / xp / growth ---------------- */
function comboMult() { return 1 + G.combo * (0.04 + G.stats.comboBonus * 0.1); }
function addScore(v, x, y) {
  const gain = Math.floor(v * G.stats.scoreMult * comboMult());
  G.score += gain;
  if (x !== undefined && gain >= 1) FX.text(x, y, "+" + fmtInt(gain), "#ffe89a", clamp(0.7 + gain / 800, 0.7, 1.8));
}
function upgradePoolExhausted() {
  return UPGRADES.every(u => (runUpgradeCounts[u.id] || 0) >= u.max);
}
function addXp(v) {
  G.xp += v * G.stats.xpMult * Math.min(comboMult(), 2.5);
  let leveled = false;
  let levelUps = 0;
  while (G.xp >= G.xpNeed && G.xpNeed > 0 && levelUps < 50) {
    levelUps++;
    G.xp -= G.xpNeed;
    G.level++;
    G.xpNeed = Math.floor(16 * Math.pow(G.level, 1.45) * G.stats.xpNeedMult);
    leveled = true;
    if (upgradePoolExhausted()) {
      // every mutation is maxed — convert further levels into a heal + score surge
      G.stats.hp = Math.min(G.stats.maxHp, G.stats.hp + G.stats.maxHp * 0.25);
      addScore(G.level * 25, G.player.x, G.player.y - G.player.r * 1.3);
    } else {
      autoMutateOne(); // mutations are picked automatically from your diet
    }
  }
  if (leveled) {
    SFX.levelup();
    FX.ring(G.player.x, G.player.y, G.player.r * 4, "#7cff6b", 4);
  }
}
function growBy(amount) {
  let mult = G.stats.growMult;
  if (G.stats.feastGrow && G.combo >= 25) mult *= 1.5;
  G.player.targetR += amount * mult;
}
function eatValue(o) { return Math.pow(o.r / G.player.r, 1.1) * (4 + G.evoIndex * 2); }

/* ---------------- eat / damage ---------------- */
function consume(o, chained) {
  const p = G.player, s = G.stats;
  const ratio = o.r / p.r;
  // combo
  G.combo++; G.comboT = s.comboTime;
  if (G.combo > G.bestCombo) { G.bestCombo = G.combo; G.run.bestCombo = G.combo; }
  if (G.combo % 5 === 0) { SFX.combo(G.combo); FX.text(p.x, p.y - p.r * 1.4, "x" + G.combo + " COMBO!", G.combo >= 25 ? "#ff9a3d" : "#7cff6b", 1.1 + Math.min(G.combo, 50) * 0.012); }
  // value
  let val = eatValue(o);
  if (o.shardVal) val = o.shardVal * s.shardValue;
  if (o.golden) { val *= 3; FX.text(o.x, o.y - o.r * 1.5, "GOLDEN ×3", "#ffd04a", 1.1); }
  const doubled = Math.random() < s.doubleChance;
  if (doubled) val *= 2;
  addXp(val);
  addScore(val * 2.2, o.x, o.y);
  growBy(o.r * o.r / Math.max(p.targetR, 1) * 0.16 / (1 + G.evoIndex * 0.5));
  if (s.eatHeal) s.hp = Math.min(s.maxHp, s.hp + s.eatHeal);
  G.eaten++; P.totalEaten++;
  if (o.shape && o.shape !== "shard" && G.run && G.run.diet) G.run.diet[o.shape] = (G.run.diet[o.shape] || 0) + 1;
  p.eatCount++; p.mouth = 1;
  // feedback
  const big = ratio > 0.55;
  if (o.shape === "shard") SFX.shard();
  else if (big) { SFX.bigEat(); FX.addShake(4 + ratio * 6); FX.addHitstop((0.03 + ratio * 0.05) * s.hitstopMult); }
  else SFX.eat(ratio, G.combo);
  if (o.shape === "rect" || o.shape === "poly") { if (big) SFX.crunch(); }
  FX.burst(o.x, o.y, o.color, big ? 18 : 8, o.r * 0.06 + 1.5, Math.max(2, o.r * 0.10), big ? 0.8 : 0.5);
  if (big && !P.settings.reduced) FX.ring(o.x, o.y, o.r * 2.2, o.color, 2.5);
  if (doubled) FX.text(o.x, o.y - o.r, "DOUBLE!", "#ffd04a", 1.0);
  // shard scatter
  if (Math.random() < s.shardChance && ratio > 0.4) spawnShard(o.x, o.y, val * 0.4);
  if (o.ai && Math.random() < 0.3 * s.enemyShards) spawnShard(o.x, o.y, val * 0.5);
  // shockwave gut
  if (s.shockEvery && p.eatCount - p.shockCount >= s.shockEvery) { p.shockCount = p.eatCount; shockwave(); }
  // slipstream dash
  if (s.dashEvery && p.eatCount - p.dashCount >= s.dashEvery) { p.dashCount = p.eatCount; p.dashT = 0.55; FX.ring(p.x, p.y, p.r * 3, "#8ae8ff", 3); }
  // chain bite
  if (!chained && s.chainBite > 0) {
    const targets = [];
    for (let i = G.objs.length - 1; i >= 0 && targets.length < s.chainBite; i--) {
      const q = G.objs[i];
      if (q !== o && q.r < p.r && dist2(q.x, q.y, o.x, o.y) < (p.r * 2.4) ** 2) {
        targets.push(q);
      }
    }
    for (const q of targets) {
      const idx = G.objs.indexOf(q);
      if (idx !== -1) { G.objs.splice(idx, 1); consume(q, true); }
    }
  }
  checkAch();
}
function shockwave() {
  const p = G.player, s = G.stats;
  SFX.shock(); FX.addShake(10);
  const R = p.r * 5 * s.shockSize;
  FX.ring(p.x, p.y, R, "#00f5d4", 5);
  FX.burst(p.x, p.y, "#00f5d4", 24, p.r * 0.08, p.r * 0.06, 0.7);
  if (G.fusions && G.fusions.spikeStorm) {
    for (let i = 0; i < 8; i++) {
      const ang = i / 8 * Math.PI * 2;
      const sv = p.r * 4.5;
      if (!G.playerShots) G.playerShots = [];
      G.playerShots.push({
        x: p.x + Math.cos(ang) * p.r,
        y: p.y + Math.sin(ang) * p.r,
        vx: Math.cos(ang) * sv,
        vy: Math.sin(ang) * sv,
        r: p.r * 0.12,
        life: 1.5,
        c: "#00f5a0"
      });
    }
  }
  G.objs.forEach(o => {
    if (dist2(o.x, o.y, p.x, p.y) < R * R) {
      o.stun = Math.max(o.stun, 2.2);
      const d = Math.max(1, Math.hypot(o.x - p.x, o.y - p.y));
      o.vx += (o.x - p.x) / d * p.r * 0.15; o.vy += (o.y - p.y) / d * p.r * 0.15;
    }
  });
  if (G.boss && dist2(G.boss.x, G.boss.y, p.x, p.y) < (R + G.boss.r) ** 2) bossDamage(G.boss.maxHp * 0.03 * s.bossDmg);
}
function hurt(amount, srcName, srcX, srcY) {
  const p = G.player, s = G.stats;
  if (G.mode === "zen" || p.iframe > 0 || G.state !== "play") return;
  let dmg = amount * s.armor;
  if (G.fusions && G.fusions.ironClad && srcName !== "incoming fire") dmg *= 0.6;
  s.hp -= dmg;
  G.run.damageTaken += dmg;
  p.iframe = s.iframes; p.hurtT = 0.35;
  if (s.rageOnHit) p.rageT = 3;
  SFX.hurt(); FX.addShake(13); FX.addHitstop(0.06);
  $("dmgFlash").style.opacity = 0.9;
  setTimeout(() => { $("dmgFlash").style.opacity = 0; }, 120);
  if (srcX !== undefined) {
    const d = Math.max(1, Math.hypot(p.x - srcX, p.y - srcY));
    p.vx += (p.x - srcX) / d * p.r * 0.4; p.vy += (p.y - srcY) / d * p.r * 0.4;
  }
  G.combo = 0; G.comboT = 0;
  if (s.hp <= 0) {
    if (s.cheatDeath > 0) {
      s.cheatDeath--; s.hp = s.maxHp * 0.5;
      FX.flash = 0.8; FX.ring(p.x, p.y, p.r * 6, "#fff0a0", 6);
      toast("<b>Guardian Angel</b> pulled you back", "success", "Revived");
      SFX.levelup();
      return;
    }
    gameOver(srcName || "the world");
  }
}

/* ---------------- level-up / upgrades ---------------- */
let runUpgradeCounts = {};
function rollChoices() {
  const s = G.stats;
  const pool = UPGRADES.filter(u => (runUpgradeCounts[u.id] || 0) < u.max);
  const picks = [];
  const n = s.choices;
  let guard = 0;
  while (picks.length < n && pool.length && guard++ < 400) {
    const weights = pool.map(u => {
      let w = RARITY_W[u.rarity];
      if (u.rarity === "legend") w *= s.legendOdds;
      return w;
    });
    let total = weights.reduce((a, b) => a + b, 0), r = Math.random() * total, idx = 0;
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { idx = i; break; } }
    const u = pool.splice(idx, 1)[0];
    picks.push(u);
  }
  return picks;
}
function checkFusions() {
  if (!G.fusions) G.fusions = { spikeStorm: false, gravitySlipstream: false, ironClad: false, reaverRage: false };
  
  if (!G.fusions.spikeStorm && (runUpgradeCounts.thorns || 0) === 3 && (runUpgradeCounts.burst || 0) === 4) {
    G.fusions.spikeStorm = true;
    triggerFusionUnlock("Spike Storm", "Shockwaves release 8 piercing spines!");
  }
  if (!G.fusions.gravitySlipstream && (runUpgradeCounts.vacuum || 0) === 5 && (runUpgradeCounts.slipstream || 0) === 1) {
    G.fusions.gravitySlipstream = true;
    triggerFusionUnlock("Gravity Slipstream", "Dashing creates a gravitational trail pulling prey!");
  }
  if (!G.fusions.ironClad && (runUpgradeCounts.density || 0) === 4 && (runUpgradeCounts.thickhide || 0) === 5) {
    G.fusions.ironClad = true;
    triggerFusionUnlock("Iron Clad", "Collision armor increased by 40% against bigger threats!");
  }
  if (!G.fusions.reaverRage && (runUpgradeCounts.rage || 0) === 1 && (runUpgradeCounts.vampiric || 0) === 3) {
    G.fusions.reaverRage = true;
    triggerFusionUnlock("Reaver Rage", "All bites heal +2 HP during Blood Rage!");
  }
}

function triggerFusionUnlock(title, desc) {
  SFX.levelup();
  FX.flash = 0.6;
  if (G.player) FX.ring(G.player.x, G.player.y, G.player.r * 4, "#00f5d4", 6);
  toast("<b>" + title + "</b><br>" + desc, "gold", "Fusion Unlocked");
}

function checkBossSpawn() {
  if (G.boss || G.bossPending || G.state !== "play" || G.mode === "zen") return;
  if (G.mode === "rush") {
    if (G.rushBossIndex < BOSSES.length) {
      G.bossPending = true;
      const runToken = G.run;
      const gen = G.bossGeneration;
      const fire = () => {
        if (G.run !== runToken || G.bossGeneration !== gen || G.state === "over" || G.state === "victory" || G.state === "menu") { G.bossPending = false; return; }
        if (G.state !== "play" || G.boss) { if (G.bossGeneration === gen) setTimeout(fire, 700); return; }
        G.bossPending = false;
        if (G.rushBossIndex < BOSSES.length) spawnBoss(BOSSES[G.rushBossIndex]);
      };
      setTimeout(fire, 2600);
    }
    return;
  }
  const eligible = BOSSES.filter(b => b.evo <= G.evoIndex && !G.run.bossKilled[BOSSES.indexOf(b)]);
  if (eligible.length) {
    G.bossPending = true;
    const runToken = G.run;
    const gen = G.bossGeneration;
    // give a longer breather between ladder bosses on endless re-cycles
    const delay = (G.mode === "endless" && G.endlessCycle > 0) ? 9000 : 2600;
    const fire = () => {
      if (G.run !== runToken || G.bossGeneration !== gen || G.state === "over" || G.state === "victory" || G.state === "menu") { G.bossPending = false; return; }
      if (G.state !== "play" || G.boss) { if (G.bossGeneration === gen) setTimeout(fire, 700); return; }
      G.bossPending = false;
      const reEligible = BOSSES.filter(b => b.evo <= G.evoIndex && !G.run.bossKilled[BOSSES.indexOf(b)]);
      if (reEligible.length) spawnBoss(reEligible[0]); // climb the ladder in order
    };
    setTimeout(fire, delay);
  }
}

function autoMutateOne() {
  const choices = rollChoices();
  if (!choices || !choices.length) return;
  let bestChoice = choices[0];
  let bestScore = -1;
  choices.forEach(u => {
    const category = UPGRADE_DIETS[u.id] || "blob";
    const baseVal = (G.run && G.run.diet) ? (G.run.diet[category] || 0) : 0;
    const rarityBonus = u.rarity === "legend" ? 35 : u.rarity === "epic" ? 15 : u.rarity === "rare" ? 5 : 0;
    const score = baseVal + rarityBonus;
    if (score > bestScore) {
      bestScore = score;
      bestChoice = u;
    }
  });
  pickUpgradeQuiet(bestChoice);
}

function pickUpgradeQuiet(u) {
  runUpgradeCounts[u.id] = (runUpgradeCounts[u.id] || 0) + 1;
  checkFusions();
  const s = G.stats;
  const beforeMax = s.maxHp;
  u.apply(s);
  if (s.heal) { s.hp = Math.min(s.maxHp, s.hp + s.heal + (s.maxHp - beforeMax)); s.heal = 0; }
  if (s.instaGrow) { G.player.targetR *= s.instaGrow; s.instaGrow = 0; }
  if (u.rarity === "legend") G.run.legendPicked = true;
  P.totalUpgrades++; G.upCount++;
  saveP();
  SFX.pick();
  FX.text(G.player.x, G.player.y - G.player.r * 1.3, "+ " + u.name, "#7cff6b", 1.25);
  if (u.rarity === "legend" || u.rarity === "epic") {
    toast("<b>" + u.name + "</b><br>" + u.desc, "success", "Mutation");
  }
  checkAch();
}

/* ---------------- evolution ---------------- */
function checkEvolution() {
  const p = G.player;
  let evolved = false;
  while (G.evoIndex < 19 && p.r >= EVOR[G.evoIndex + 1]) {
    G.evoIndex++;
    G.run.maxEvoRun = Math.max(G.run.maxEvoRun, G.evoIndex);
    P.maxEvo = Math.max(P.maxEvo, G.evoIndex);
    evolveFanfare();
    evolved = true;
  }
  if (evolved) {
    checkBossSpawn();
  }
}
function evolveFanfare() {
  const p = G.player, evo = EVOS[G.evoIndex];
  SFX.evolve();
  FX.addHitstop(0.28 * G.stats.hitstopMult);
  FX.addShake(16);
  if (!P.settings.reduced) {
    FX.flash = 1;
    $("evoFlash").style.transition = "none"; $("evoFlash").style.opacity = 0.85;
    requestAnimationFrame(() => { $("evoFlash").style.transition = "opacity .9s"; $("evoFlash").style.opacity = 0; });
  }
  FX.ring(p.x, p.y, p.r * 6, "#ff4d9e", 7);
  FX.ring(p.x, p.y, p.r * 9, "#00f5d4", 4);
  FX.burst(p.x, p.y, "#fff", 36, p.r * 0.1, p.r * 0.07, 1.1);
  if (G.stats.evoHeal) G.stats.hp = G.stats.maxHp;
  $("stageToastName").textContent = evo.name;
  const prevBand = bandFor(G.evoIndex - 1), band = bandFor(G.evoIndex);
  const sLabel = $("stageToastScale");
  if (sLabel) sLabel.textContent = band !== prevBand ? "New Scale: " + band.name : "Evolution";
  const t = $("stageToast"); t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
  checkAch();
}

/* ---------------- run end ---------------- */
function essenceEarned() {
  let e = Math.floor(Math.sqrt(G.score) * 0.9 + G.evoIndex * 6);
  if (G.run.victory) e += 300;
  e += (G.endlessCycle || 0) * 50; // endless cycles pay out
  return Math.floor(e * G.stats.essenceMult);
}
function finishRunCommon() {
  G.run.score = G.score; G.run.time = G.time; G.run.runOver = true;
  const ess = essenceEarned();
  P.essence += ess; P.runs++; P.totalTime += G.time;
  const newBest = G.score > P.bestScore;
  if (newBest) P.bestScore = G.score;
  saveP();
  checkAch();
  $("bossWrap").style.display = "none";
  return { ess, newBest };
}
function gameOver(cause) {
  if (G.state === "over") return;
  G.state = "over";
  SFX.death();
  FX.addShake(24);
  FX.burst(G.player.x, G.player.y, "#00f5d4", 60, G.player.r * 0.08, G.player.r * 0.08, 1.4);
  const { ess, newBest } = finishRunCommon();
  $("goScore").textContent = fmtInt(G.score);
  $("goEaten").textContent = fmtInt(G.eaten);
  $("goEvo").textContent = EVOS[G.evoIndex].name + (G.mode === "endless" && G.endlessCycle > 0 ? " +" + G.endlessCycle : "");
  $("goCombo").textContent = "x" + G.bestCombo;
  $("goTime").textContent = fmtTime(G.time);
  $("goEssence").textContent = "+" + fmtInt(ess);
  $("deathCause").textContent = "Destroyed by " + cause;
  $("goNewBest").classList.toggle("hidden", !newBest);
  setTimeout(() => { show("gameOverScreen"); hide("hud"); }, 700);
}
function victory() {
  if (G.state === "victory") return;
  G.state = "victory";
  G.run.victory = true; P.victories++;
  SFX.victory();
  FX.flash = 1; FX.addShake(30);
  FX.burst(G.player.x, G.player.y, "#fff0a0", 120, G.player.r * 0.1, G.player.r * 0.1, 2);
  const { ess } = finishRunCommon();
  $("vScore").textContent = fmtInt(G.score);
  $("vEaten").textContent = fmtInt(G.eaten);
  $("vCombo").textContent = "x" + G.bestCombo;
  $("vTime").textContent = fmtTime(G.time);
  $("vEssence").textContent = "+" + fmtInt(ess);
  setTimeout(() => { show("victoryScreen"); hide("hud"); }, 1100);
}

/* ---------------- achievements ---------------- */
let achToastQueue = 0;
function checkAch() {
  const st = {
    maxEvoRun: G.run ? G.run.maxEvoRun : 0, bestCombo: G.run ? G.run.bestCombo : 0,
    score: G.score, time: G.time, bossKilled: G.run ? G.run.bossKilled : {},
    world: G.run ? G.run.world : "", runOver: G.run ? G.run.runOver : false,
    victory: G.run ? G.run.victory : false, damageTaken: G.run ? G.run.damageTaken : 1,
    legendPicked: G.run ? G.run.legendPicked : false
  };
  let dirty = false;
  for (const a of ACH) {
    if (P.ach[a.id]) continue;
    let ok = false;
    try { ok = a.test(st); } catch (e) {}
    if (ok) {
      P.ach[a.id] = true; P.essence += a.reward; dirty = true;
      const delay = Math.min(achToastQueue++ * 350, 2400);
      setTimeout(() => { toast("<b>" + a.name + "</b><br>+" + a.reward + " essence", "gold", "Feat"); achToastQueue = Math.max(0, achToastQueue - 1); }, delay);
    }
  }
  if (dirty) saveP();
}

/* ============================================================
   UI HELPERS
============================================================ */
function show(id) { $(id).classList.remove("hidden"); }
function hide(id) { $(id).classList.add("hidden"); }
function hideAll(ids) { ids.forEach(hide); }
/* typed notifications: type ∈ success | info | danger | gold, label is a small-caps category tag */
function toast(html, type, label) {
  const wrap = $("toasts");
  const t = document.createElement("div");
  t.className = "toast t-" + (type || "success");
  t.innerHTML = (label ? '<div class="tl">' + label + '</div>' : "") + '<div class="tx">' + html + '</div>';
  wrap.appendChild(t);
  while (wrap.children.length > 5) wrap.removeChild(wrap.firstChild);
  setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 3800);
}

/* ---------------- ambient background ---------------- */
function buildAmbient() {
  G.ambient = [];
  for (let i = 0; i < 110; i++) {
    G.ambient.push({ u: Math.random(), v: Math.random(), s: rand(0.6, 2.4), f: i < 70 ? 0.22 : 0.5, tw: rand(1, 4), ph: rand(0, TAU) });
  }
  G.nebulae = [];
  for (let i = 0; i < 6; i++) {
    G.nebulae.push({ u: Math.random(), v: Math.random(), s: rand(0.25, 0.6), hue: rand(0, 360), ph: rand(0, TAU) });
  }
}

/* ---------------- HUD refresh ---------------- */
let hudTick = 0;
function refreshHud(force) {
  hudTick++;
  if (!force && hudTick % 2) return; // 30hz is plenty for DOM
  const s = G.stats, evo = EVOS[G.evoIndex];
  $("evoName").textContent = evo.name;
  const cycleTag = (G.mode === "endless" && G.endlessCycle > 0) ? "  ·  CYCLE " + (G.endlessCycle + 1) : "";
  $("sizeLabel").textContent = fmtSize(G.player.r) + "  ·  LV " + G.level + cycleTag;
  $("xpBar").style.width = clamp(G.xp / G.xpNeed * 100, 0, 100) + "%";
  $("hpBar").style.width = clamp(s.hp / s.maxHp * 100, 0, 100) + "%";
  $("hpBar").style.background = s.hp / s.maxHp < 0.3 ? "linear-gradient(90deg,#ff3a5e,#ff7a3a)" : "";
  $("scoreVal").textContent = fmtInt(G.score);
  // combo
  const cb = $("comboBox");
  if (G.combo >= 3) {
    cb.classList.add("show");
    $("comboNum").textContent = "x" + G.combo;
    $("comboNum").style.color = G.combo >= 50 ? "#ff4d9e" : G.combo >= 25 ? "#ff9a3d" : "#7cff6b";
    $("comboLbl").textContent = G.combo >= 50 ? "RAMPAGE" : G.combo >= 25 ? "FRENZY" : "COMBO";
    $("comboTimerBar").style.width = clamp(G.comboT / s.comboTime * 100, 0, 100) + "%";
  } else cb.classList.remove("show");
  if (G.boss) $("bossHpBar").style.width = clamp(G.boss.hp / G.boss.maxHp * 100, 0, 100) + "%";
  const cdBar = $("dashCooldownBar");
  if (cdBar) {
    const cdRatio = G.player ? G.player.manualDashCd / 1.5 : 0;
    cdBar.style.width = (1 - cdRatio) * 100 + "%";
    cdBar.style.background = cdRatio > 0 ? "var(--warn)" : "var(--food)";
  }
  
  // Update HUD diet values
  const db = $("dietBlob"); if (db) db.innerHTML = getDietSvg("organic", "#00f5a0") + " " + (G.run && G.run.diet ? G.run.diet.blob || 0 : 0);
  const dr = $("dietRect"); if (dr) dr.innerHTML = getDietSvg("structural", "#ff9a3d") + " " + (G.run && G.run.diet ? G.run.diet.rect || 0 : 0);
  const dp = $("dietPoly"); if (dp) dp.innerHTML = getDietSvg("kinetic", "#00bbf9") + " " + (G.run && G.run.diet ? G.run.diet.poly || 0 : 0);
  const dg = $("dietGlow"); if (dg) dg.innerHTML = getDietSvg("cosmic", "#d946ef") + " " + (G.run && G.run.diet ? G.run.diet.glow || 0 : 0);
}

/* ============================================================
   UPDATE — the simulation
 ============================================================ */
const KEYS = {};
window.addEventListener("keydown", e => {
  if (e.key) KEYS[e.key.toLowerCase()] = true;
  
  // Mute toggle (always available)
  if (e.key && e.key.toLowerCase() === "m") {
    P.settings.muted = !P.settings.muted;
    AudioSys.applyVolumes();
    saveP();
    toast(P.settings.muted ? "Sound muted" : "Sound on", "info", "Audio");
    return;
  }
  
  // Game Over Screen Shortcuts
  if (G.state === "over") {
    if (e.key === " " || e.key === "Enter") {
      SFX.ui(); hide("gameOverScreen"); startRun();
      return;
    }
    if (e.key === "Escape") {
      SFX.ui(); hide("gameOverScreen"); G.state = "menu"; updateMenuChrome(); show("menuScreen");
      return;
    }
  }
  
  // Victory Screen Shortcuts
  if (G.state === "victory") {
    if (e.key === " " || e.key === "Enter") {
      SFX.ui(); hide("victoryScreen"); startRun();
      return;
    }
    if (e.key === "Escape") {
      SFX.ui(); hide("victoryScreen"); G.state = "menu"; updateMenuChrome(); show("menuScreen");
      return;
    }
  }
  
  // Pause Screen Shortcuts
  if (G.state === "pause") {
    if (e.key === "Escape" && !$("settingsScreen").classList.contains("hidden")) {
      SFX.ui(); hide("settingsScreen");
      return;
    }
    if (e.key === "Escape" || (e.key && e.key.toLowerCase() === "p") || e.key === "Enter") {
      togglePause();
      return;
    }
    if (e.key && e.key.toLowerCase() === "q") {
      SFX.ui(); hide("pauseScreen"); hide("hud");
      finishRunCommon(); G.state = "menu";
      updateMenuChrome(); show("menuScreen");
      return;
    }
  }
  
  // Trigger manual dash
  if (G.state === "play" && (e.key === " " || e.key === "Shift" || (e.key && (e.key.toLowerCase() === "f" || e.key.toLowerCase() === "e")))) {
    e.preventDefault();
    triggerManualDash();
    return;
  }
  
  // Normal Gameplay Pause
  if (G.state === "play" && (e.key === "Escape" || (e.key && e.key.toLowerCase() === "p"))) {
    togglePause();
    return;
  }

  // Menu: Escape closes whichever overlay panel is open
  if (G.state === "menu" && e.key === "Escape") {
    for (const id of ["settingsScreen", "shopScreen", "achScreen", "worldsScreen"]) {
      if (!$(id).classList.contains("hidden")) { SFX.ui(); hide(id); updateMenuChrome(); return; }
    }
  }
});
window.addEventListener("keyup", e => { if (e.key) KEYS[e.key.toLowerCase()] = false; });
function togglePause() {
  if (G.state === "play") { G.state = "pause"; show("pauseScreen"); SFX.ui(); }
  else if (G.state === "pause") { G.state = "play"; hide("pauseScreen"); hide("settingsScreen"); SFX.ui(); }
}

function keyboardDir() {
  let dx = 0, dy = 0;
  if (KEYS["w"] || KEYS["arrowup"]) dy -= 1;
  if (KEYS["s"] || KEYS["arrowdown"]) dy += 1;
  if (KEYS["a"] || KEYS["arrowleft"]) dx -= 1;
  if (KEYS["d"] || KEYS["arrowright"]) dx += 1;
  if (!dx && !dy) return null;
  const m = Math.hypot(dx, dy);
  return { x: dx / m, y: dy / m };
}

function update(dt) {
  const p = G.player, s = G.stats;
  const wdt = dt * s.timeSlow;           // world runs slower with Time Eater
  G.time += dt;

  /* ---- player movement ---- */
  const z = camZoom();
  const kd = keyboardDir();
  let tx, ty;
  if (kd) { tx = p.x + kd.x * p.r * 8; ty = p.y + kd.y * p.r * 8; }
  else { tx = p.x + (INPUT.x - W / 2) / z; ty = p.y + (INPUT.y - H / 2) / z; }
  const ddx = tx - p.x, ddy = ty - p.y, dd = Math.hypot(ddx, ddy);
  let top = p.r * 3.1 * s.speed * (1 + s.evoSpeed * G.evoIndex);
  if (s.frenzySpeed && G.combo >= 10) top *= 1 + s.frenzySpeed;
  if (p.rageT > 0) top *= 1.25;
  if (p.dashT > 0) top *= 2.1;
  const deadzone = p.r * 0.35;
  if (dd > deadzone) {
    const want = clamp((dd - deadzone) / (p.r * 3), 0, 1) * top;
    const ax = ddx / dd * want, ay = ddy / dd * want;
    const k = 1 - Math.pow(0.0015, dt * s.accel);
    p.vx = lerp(p.vx, ax, k); p.vy = lerp(p.vy, ay, k);
  } else { p.vx *= Math.pow(0.002, dt); p.vy *= Math.pow(0.002, dt); }
  p.x += p.vx * dt; p.y += p.vy * dt;
  p.faceA = angleLerp(p.faceA, Math.atan2(p.vy, p.vx), Math.abs(p.vx) + Math.abs(p.vy) > p.r * 0.2 ? 1 - Math.pow(0.001, dt) : 0);

  /* ---- timers / regen / smooth growth ---- */
  p.iframe = Math.max(0, p.iframe - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.rageT = Math.max(0, p.rageT - dt);
  p.dashT = Math.max(0, p.dashT - dt);
  p.manualDashCd = Math.max(0, p.manualDashCd - dt);
  p.biteCd = Math.max(0, (p.biteCd || 0) - dt);
  p.mouth = Math.max(0, p.mouth - dt * 3.2);
  s.hp = Math.min(s.maxHp, s.hp + s.regen * dt);
  if (p.targetR > p.r) p.r = Math.min(p.targetR, p.r + (p.targetR - p.r) * (1 - Math.pow(0.02, dt)) + p.r * 0.02 * dt);
  checkEvolution();

  /* ---- combo decay ---- */
  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) { G.combo = 0; } }

  /* ---- trail ---- */
  const trail = P.equippedTrail;
  if (trail && trail !== "trail_none" && !P.settings.reduced && Math.hypot(p.vx, p.vy) > p.r * 0.4) {
    const td = SHOP.find(x => x.id === trail);
    if (td && Math.random() < 0.5) {
      FX.parts.push({ x: p.x - Math.cos(p.faceA) * p.r * 0.8 + rand(-p.r, p.r) * 0.4, y: p.y - Math.sin(p.faceA) * p.r * 0.8 + rand(-p.r, p.r) * 0.4,
        vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5), r: p.r * rand(0.08, 0.18), c: td.color, life: 0.8, decay: 1.4, grav: 0 });
    }
  }

  /* ---- afterburner wake ---- */
  if (s.afterburn && Math.hypot(p.vx, p.vy) > p.r * 1.2) {
    const burnTargets = [];
    const bx = p.x - Math.cos(p.faceA) * p.r, by = p.y - Math.sin(p.faceA) * p.r;
    for (let i = G.objs.length - 1; i >= 0; i--) {
      const o = G.objs[i];
      if (o.r < p.r * 0.35 && dist2(o.x, o.y, bx, by) < (p.r * 1.1) ** 2) {
        burnTargets.push(o);
      }
    }
    for (const o of burnTargets) {
      const idx = G.objs.indexOf(o);
      if (idx !== -1) { G.objs.splice(idx, 1); consume(o, true); }
    }
  }

  /* ---- gravity trails (Gravity Slipstream) ---- */
  if (G.fusions && G.fusions.gravitySlipstream) {
    if (p.dashT > 0 && Math.random() < 0.25) {
      if (!G.gravityTrails) G.gravityTrails = [];
      G.gravityTrails.push({ x: p.x, y: p.y, r: p.r * 1.8, life: 1.2, maxLife: 1.2 });
    }
    if (G.gravityTrails) {
      for (let i = G.gravityTrails.length - 1; i >= 0; i--) {
        const gt = G.gravityTrails[i];
        gt.life -= dt;
        if (gt.life <= 0) { G.gravityTrails.splice(i, 1); continue; }
        for (const o of G.objs) {
          if (o.shape !== "shard" && o.r < p.r * (1 + s.biteSize)) {
            const dx = gt.x - o.x, dy = gt.y - o.y;
            const d = Math.max(1, Math.hypot(dx, dy));
            if (d < gt.r * 2.5) {
              const pull = p.r * 5.0 * (gt.life / gt.maxLife) * dt;
              o.x += dx / d * pull;
              o.y += dy / d * pull;
            }
          }
        }
      }
    }
  }

  /* ---- player shots / thorns (Spike Storm) ---- */
  if (G.playerShots) {
    for (let i = G.playerShots.length - 1; i >= 0; i--) {
      const sh = G.playerShots[i];
      sh.x += sh.vx * wdt; sh.y += sh.vy * wdt; sh.life -= wdt;
      if (sh.life <= 0) { G.playerShots.splice(i, 1); continue; }
      if (G.boss && dist2(sh.x, sh.y, G.boss.x, G.boss.y) < (G.boss.r + sh.r) ** 2) {
        bossDamage((5 + p.r * 0.05) * s.bossDmg);
        FX.burst(sh.x, sh.y, "#00f5d4", 6, sh.r, sh.r, 0.4);
        G.playerShots.splice(i, 1);
        continue;
      }
      let hit = false;
      for (let j = G.objs.length - 1; j >= 0; j--) {
        const o = G.objs[j];
        if (o.ai && o.r >= p.r * (1 + s.biteSize)) {
          if (dist2(sh.x, sh.y, o.x, o.y) < (o.r + sh.r) ** 2) {
            o.vx += sh.vx * 0.45; o.vy += sh.vy * 0.45;
            o.stun = Math.max(o.stun || 0, 1.8);
            FX.burst(sh.x, sh.y, "#00f5d4", 6, sh.r, sh.r, 0.4);
            hit = true;
            break;
          }
        } else if (o.shape !== "shard" && o.r < p.r * (1 + s.biteSize)) {
          if (dist2(sh.x, sh.y, o.x, o.y) < (o.r + sh.r) ** 2) {
            const spliceIdx = G.objs.indexOf(o);
            if (spliceIdx !== -1) G.objs.splice(spliceIdx, 1);
            consume(o, true);
            FX.burst(sh.x, sh.y, "#00f5a0", 8, sh.r, sh.r, 0.5);
            hit = true;
            break;
          }
        }
      }
      if (hit) { G.playerShots.splice(i, 1); }
    }
  }

  /* ---- objects ---- */
  const magR = p.r * 2.6 * s.magnet;
  const eatBound = p.r * (1 + s.biteSize);
  const vr = viewRadius();
  const toRemove = [];
  const toConsume = [];
  for (let i = G.objs.length - 1; i >= 0; i--) {
    const o = G.objs[i];
    if (!o) continue;
    const dx = p.x - o.x, dy = p.y - o.y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2);
    /* despawn far away */
    if (d > vr * 2.7) { toRemove.push(o); continue; }
    /* shard lifetime */
    if (o.shape === "shard") { o.life -= dt; o.a += o.spin * wdt; if (o.life <= 0) { toRemove.push(o); continue; } }
    o.stun = Math.max(0, o.stun - wdt);
    const edible = o.r <= eatBound;
    /* magnet pull */
    if (edible && (d < magR + o.r || (s.undertow && o.r < p.r * 0.5 && d < magR * 2.2))) {
      const pull = p.r * 4.4 * s.magnetPull * clamp(1 - d / (magR * 2.4), 0.15, 1);
      o.x += dx / Math.max(d, 1) * pull * dt;
      o.y += dy / Math.max(d, 1) * pull * dt;
    }
    /* eat / collide */
    const reach = p.r * 0.92 * s.reach;
    if (edible) {
      if (d < reach + o.r * 0.25) { toConsume.push(o); continue; }
    } else if (d < p.r * 0.8 + o.r * 0.72) {
      const ratio = o.r / p.r;
      let dmg = clamp(6 + ratio * 6, 6, 26);
      if (ratio > 1.6) dmg *= s.bigArmor;
      if (G.fusions && G.fusions.ironClad && ratio > 1.0) dmg *= 0.6;
      hurt(dmg, o.name, o.x, o.y);
    }
    /* enemy AI */
    if (o.ai && o.stun <= 0) {
      const bigger = o.r > eatBound;
      const sp = Math.max(o.r, p.r * 0.25);
      if (o.ai === "wander" || (!bigger && o.ai !== "dart")) {
        // small things flee, wanderers drift
        if (!bigger && d < p.r * 6) { o.vx = -dx / Math.max(d, 1) * sp * 1.1; o.vy = -dy / Math.max(d, 1) * sp * 1.1; }
        else {
          o.wx += rand(-1, 1) * wdt; o.wy += rand(-1, 1) * wdt;
          const m = Math.max(0.3, Math.hypot(o.wx, o.wy));
          o.vx = o.wx / m * sp * 0.5; o.vy = o.wy / m * sp * 0.5;
        }
      } else if (o.ai === "chase" && bigger) {
        o.vx = lerp(o.vx, dx / Math.max(d, 1) * sp * 1.25, 1 - Math.pow(0.05, wdt));
        o.vy = lerp(o.vy, dy / Math.max(d, 1) * sp * 1.25, 1 - Math.pow(0.05, wdt));
      } else if (o.ai === "dart") {
        o.dartT -= wdt;
        if (o.dartT <= 0 && d < vr * 0.8) {
          o.dartT = rand(1.4, 2.6);
          const dir = bigger ? 1 : -1;
          o.vx = dx / Math.max(d, 1) * sp * 3.2 * dir; o.vy = dy / Math.max(d, 1) * sp * 3.2 * dir;
          if (bigger && !P.settings.reduced) FX.ring(o.x, o.y, o.r * 1.6, o.color, 2);
        }
        o.vx *= Math.pow(0.08, wdt); o.vy *= Math.pow(0.08, wdt);
      } else if (o.ai === "shooter") {
        // keep distance and fire
        const want = vr * 0.42;
        const dir = d < want ? -1 : 0.4;
        o.vx = lerp(o.vx, -dx / Math.max(d, 1) * sp * dir * -1, 1 - Math.pow(0.08, wdt));
        o.vy = lerp(o.vy, -dy / Math.max(d, 1) * sp * dir * -1, 1 - Math.pow(0.08, wdt));
        o.fireT -= wdt;
        if (o.fireT <= 0 && d < vr * 1.0 && G.shots.length < 40 && G.time > 10) {
          o.fireT = rand(2.2, 3.4);
          const sv = p.r * 2.6;
          G.shots.push({ x: o.x, y: o.y, vx: dx / Math.max(d, 1) * sv, vy: dy / Math.max(d, 1) * sv, r: p.r * 0.13, life: 3.2, c: o.color });
          SFX.shard();
        }
      }
    } else if (!o.ai && o.shape !== "shard") {
      o.vx *= Math.pow(0.2, wdt); o.vy *= Math.pow(0.2, wdt);
    }
    o.x += o.vx * wdt; o.y += o.vy * wdt;
    o.a += o.spin * wdt * 0.4;
  }
  for (const o of toRemove) {
    const idx = G.objs.indexOf(o);
    if (idx !== -1) G.objs.splice(idx, 1);
  }
  for (const o of toConsume) {
    const idx = G.objs.indexOf(o);
    if (idx !== -1) { G.objs.splice(idx, 1); consume(o); }
  }

  /* ---- enemy shots ---- */
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const sh = G.shots[i];
    sh.x += sh.vx * wdt; sh.y += sh.vy * wdt; sh.life -= wdt;
    if (sh.life <= 0) { G.shots.splice(i, 1); continue; }
    if (dist2(sh.x, sh.y, p.x, p.y) < (p.r * 0.85 + sh.r) ** 2) {
      G.shots.splice(i, 1);
      hurt(sh.dmg || 7, sh.meteor ? "a meteor" : "incoming fire", sh.x, sh.y);
    }
  }

  /* ---- boss ---- */
  if (G.boss) updateBoss(wdt, dt);

  /* ---- universe core ---- */
  if (G.victoryCore) {
    const c = G.victoryCore;
    c.t += dt;
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < magR + c.r) { const pull = p.r * 8 * dt; c.x += (p.x - c.x) / Math.max(d, 1) * pull; c.y += (p.y - c.y) / Math.max(d, 1) * pull; }
    if (p.r >= c.r * 0.9 && d < p.r + c.r * 0.65) { G.victoryCore = null; victory(); return; }
  }

  /* ---- world events / first-run guide ---- */
  updateWorldEvents(dt);
  tutUpdate(dt);

  /* ---- spawn maintenance ---- */
  const maxObjs = P.settings.perf ? 80 : 130;
  let burstSpawn = 0;
  while (G.objs.length < maxObjs && burstSpawn++ < 1) spawnObject(false);
}

/* ---------------- boss update ---------------- */
function updateBoss(wdt, dt) {
  const b = G.boss, p = G.player, s = G.stats;
  b.t += wdt;
  b.hitFlash = Math.max(0, b.hitFlash - dt * 4);
  b.fleeT = Math.max(0, (b.fleeT || 0) - wdt);
  const dx = p.x - b.x, dy = p.y - b.y;
  const d = Math.max(1, Math.hypot(dx, dy));
  /* escalation: bosses get faster and meaner at 66% and 33% HP */
  const frac = b.hp / b.maxHp;
  const targetPhase = frac < 0.33 ? 2 : frac < 0.66 ? 1 : 0;
  if (targetPhase > b.phaseIdx) {
    b.phaseIdx = targetPhase;
    SFX.bossRoar();
    FX.addShake(12);
    FX.ring(b.x, b.y, b.r * 3, b.color, 5);
    FX.burst(b.x, b.y, b.color, 24, b.r * 0.05, b.r * 0.06, 0.8);
    for (let i = 0; i < 1 + targetPhase; i++) spawnShard(b.x + rand(-b.r, b.r) * 1.3, b.y + rand(-b.r, b.r) * 1.3, G.xpNeed * 0.05);
    b.summonT = Math.min(b.summonT, 2);
    b.shootT = Math.min(b.shootT, 1.2);
    if (b.def.final) {
      const names = ["RADIANCE", "COLLAPSE", "SUPERNOVA"];
      toast("<b>" + b.name + "</b> enters <b>" + names[targetPhase] + "</b>", "danger", "Final Phase");
      FX.flash = 0.5;
    } else {
      toast("<b>" + b.name + "</b> " + (targetPhase === 1 ? "grows furious" : "is enraged"), "danger", "Threat");
    }
  }
  const rage = 1 + 0.18 * b.phaseIdx;
  const sp = b.r * 0.95 * rage;
  /* movement phases */
  if (b.phase === "windup") {
    b.telA += wdt;
    b.vx *= Math.pow(0.01, wdt); b.vy *= Math.pow(0.01, wdt);
    if (b.telA > 0.9 - 0.15 * b.phaseIdx) { b.phase = "dash"; b.telA = 0; b.vx = dx / d * sp * 4.4; b.vy = dy / d * sp * 4.4; SFX.crunch(); FX.addShake(6); }
  } else if (b.phase === "dash") {
    b.telA += wdt;
    if (b.telA > 0.7) {
      b.telA = 0;
      if (b.dashesLeft > 0) { b.dashesLeft--; b.phase = "windup"; b.telA = 0.45; } // enraged bosses chain dashes
      else b.phase = "stalk";
    }
  } else { // stalk
    const dir = b.fleeT > 0 ? -0.9 : 1;
    b.vx = lerp(b.vx, dx / d * sp * dir, 1 - Math.pow(0.05, wdt));
    b.vy = lerp(b.vy, dy / d * sp * dir, 1 - Math.pow(0.05, wdt));
    if (b.def.dash && b.fleeT <= 0 && d < viewRadius() * 0.9 && Math.random() < wdt * 0.35) {
      b.phase = "windup"; b.telA = 0;
      b.dashesLeft = b.phaseIdx >= 2 ? 2 : b.phaseIdx;
    }
  }
  b.x += b.vx * wdt; b.y += b.vy * wdt;
  /* final boss: a gravity well drags you in once it starts collapsing */
  if (b.def.final && b.phaseIdx >= 1 && G.state === "play") {
    const pull = p.r * (0.9 + 0.6 * (b.phaseIdx - 1)) * wdt;
    p.vx += (b.x - p.x) / d * pull;
    p.vy += (b.y - p.y) / d * pull;
  }
  /* summons */
  if (b.def.summon) {
    b.summonT -= wdt;
    if (b.summonT <= 0) {
      b.summonT = 5.5 - 0.8 * b.phaseIdx;
      for (let i = 0; i < 2 + b.phaseIdx; i++) {
        const tier = clamp(G.evoIndex - randi(0, 1), 0, 19);
        const def = ENEMIES[tier][randi(0, 1)];
        G.objs.push({ x: b.x + rand(-b.r, b.r), y: b.y + rand(-b.r, b.r), vx: 0, vy: 0,
          r: EVOR[tier] * rand(0.5, 0.8), name: def[0], color: def[2] || "#ff6a6a", shape: "blob", tier,
          ai: def[1], a: 0, spin: 0, wob: Math.random() * 9, hp: 1, fireT: rand(1, 2), dartT: rand(0.5, 1.5), wx: 0, wy: 0, stun: 0 });
      }
      if (!P.settings.reduced) FX.ring(b.x, b.y, b.r * 1.8, b.color, 3);
    }
  }
  /* shots: fans widen with rage; enraged shooters alternate in radial rings */
  if (b.def.shoot) {
    b.shootT -= wdt;
    if (b.shootT <= 0 && G.shots.length < 44) {
      b.shootT = 2.1 - 0.3 * b.phaseIdx;
      b.volley++;
      if (b.phaseIdx >= 2 && b.volley % 2 === 0) {
        const n = 10;
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU + b.volley * 0.31;
          G.shots.push({ x: b.x, y: b.y, vx: Math.cos(a) * p.r * 1.7, vy: Math.sin(a) * p.r * 1.7, r: p.r * 0.14, life: 3.2, c: b.color });
        }
      } else {
        const n = 3 + b.phaseIdx;
        for (let i = 0; i < n; i++) {
          const a = Math.atan2(dy, dx) + (i - (n - 1) / 2) * 0.3;
          G.shots.push({ x: b.x, y: b.y, vx: Math.cos(a) * p.r * 2.4, vy: Math.sin(a) * p.r * 2.4, r: p.r * 0.16, life: 3.6, c: b.color });
        }
      }
      SFX.shard();
    }
  }
  /* final boss supernova: expanding bullet rings independent of the shoot timer */
  if (b.def.final && b.phaseIdx >= 2) {
    b.novaT = (b.novaT || 1.5) - wdt;
    if (b.novaT <= 0 && G.shots.length < 52) {
      b.novaT = 3.2;
      SFX.shock();
      FX.ring(b.x, b.y, b.r * 2.4, "#fff0c0", 4);
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + b.t;
        G.shots.push({ x: b.x, y: b.y, vx: Math.cos(a) * p.r * 1.4, vy: Math.sin(a) * p.r * 1.4, r: p.r * 0.18, life: 4, c: "#fff0c0" });
      }
    }
  }
  /* split — at half HP, scatter food + brood once */
  if (b.def.split && !b.didSplit && b.hp <= b.maxHp * 0.5) {
    b.didSplit = true;
    for (let i = 0; i < 6; i++) spawnShard(b.x + rand(-b.r, b.r) * 1.4, b.y + rand(-b.r, b.r) * 1.4, G.xpNeed * 0.06);
    FX.burst(b.x, b.y, b.color, 30, b.r * 0.05, b.r * 0.06, 0.9);
    toast("<b>" + b.name + "</b> ruptures — feed on the shards", "danger", "Threat");
  }
  /* feed the fight: bosses periodically shed edible shards so you can grow */
  b.shedT = (b.shedT || 3) - wdt;
  if (b.shedT <= 0) { b.shedT = 4.5; spawnShard(b.x + rand(-b.r, b.r), b.y + rand(-b.r, b.r), G.xpNeed * 0.05); }
  /* contact: bite or be bitten */
  const canBite = p.r >= b.r * (0.8 - s.biteSize * 0.5);
  if (d < p.r * 0.85 + b.r * 0.8) {
    if (canBite && p.biteCd <= 0) {
      p.biteCd = 0.3;
      if (G.tut) G.tut.bossBitten = true;
      const dmg = (6 + p.r * 0.085) * s.bossDmg;
      bossDamage(dmg);
      if (G.fusions && G.fusions.reaverRage && p.rageT > 0) {
        s.hp = Math.min(s.maxHp, s.hp + 2);
        FX.text(p.x, p.y - p.r, "+2 HP", "#00f5a0", 1.0);
      }
      b.bites = (b.bites || 0) + 1;
      if (b.bites % 3 === 0) b.fleeT = 1.3;
      FX.addHitstop(0.05 * s.hitstopMult); FX.addShake(7);
      FX.burst(b.x + (p.x - b.x) * 0.4, b.y + (p.y - b.y) * 0.4, b.color, 10, b.r * 0.04, b.r * 0.05, 0.5);
      FX.text(b.x, b.y - b.r, "-" + fmtInt(dmg), "#ff8a8a", 1.0);
      p.mouth = 1;
      const k = b.r * 0.4; b.vx += -dx / d * k; b.vy += -dy / d * k;
    } else if (!canBite) {
      hurt(16, b.name, b.x, b.y);
      if (s.thorns && G.boss) bossDamage(16 * s.thorns);
    }
  }
}

/* ============================================================
   RENDER
============================================================ */
function hexA(hex, a) {
  if (!hex || hex[0] !== "#") return "rgba(128,128,128," + a + ")";
  const v = parseInt(hex.slice(1), 16);
  return "rgba(" + ((v >> 16) & 255) + "," + ((v >> 8) & 255) + "," + (v & 255) + "," + a + ")";
}
function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function mod(n, m) { return ((n % m) + m) % m; }

function render() {
  const c = ctx2d, p = G.player;
  const playing = p && (G.state === "play" || G.state === "pause" || G.state === "over" || G.state === "victory");
  const t = performance.now() / 1000;
  const band = bandFor(playing ? G.evoIndex : 0);
  /* background gradient: world tint at small scale -> cosmic at large */
  const g = c.createLinearGradient(0, 0, 0, H);
  if (playing) {
    const cosmic = clamp((G.evoIndex - 12) / 7, 0, 1);
    g.addColorStop(0, cosmic > 0.5 ? band.top : G.world.grad[0]);
    g.addColorStop(1, cosmic > 0.5 ? band.bot : G.world.grad[1]);
  } else { g.addColorStop(0, "#0e0e1c"); g.addColorStop(1, "#191229"); }
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  if (!playing) { renderMenuBg(c, t, frameDt); return; }

  const z = camZoom();
  let shx = 0, shy = 0;
  if (FX.shake > 0) { shx = rand(-1, 1) * FX.shake; shy = rand(-1, 1) * FX.shake; }

  /* nebula blobs (deep parallax) */
  if (!P.settings.perf) {
    for (const nb of G.nebulae) {
      const x = mod(nb.u * W * 1.6 - p.x * z * 0.06, W * 1.6) - W * 0.3;
      const y = mod(nb.v * H * 1.6 - p.y * z * 0.06, H * 1.6) - H * 0.3;
      const r = Math.min(W, H) * nb.s;
      const cosmic = clamp((G.evoIndex - 10) / 9, 0, 1);
      const hue = Math.round((nb.hue + G.evoIndex * 14) % 360 / 12) * 12; // quantize so the sprite cache stays small
      drawGlow(c, "hsl(" + hue + ",60%," + Math.round(24 + cosmic * 18) + "%)", x, y, r, 0.10);
    }
  }
  /* parallax motes / stars */
  c.save();
  for (const st of G.ambient) {
    const x = mod(st.u * W * 1.4 - p.x * z * st.f, W * 1.4) - W * 0.2 + shx * st.f;
    const y = mod(st.v * H * 1.4 - p.y * z * st.f, H * 1.4) - H * 0.2 + shy * st.f;
    const tw = 0.35 + 0.3 * Math.sin(t * st.tw + st.ph);
    c.globalAlpha = tw * (0.4 + st.f);
    c.fillStyle = G.evoIndex >= 14 ? "#cdd8ff" : "#9a93b8";
    c.fillRect(x, y, st.s, st.s);
  }
  c.restore();

  /* world space */
  c.save();
  c.translate(W / 2 + shx, H / 2 + shy);
  c.scale(z, z);
  c.translate(-p.x, -p.y);
  const vr = viewRadius() * 1.15;

  /* gravity trails */
  if (G.fusions && G.fusions.gravitySlipstream && G.gravityTrails) {
    c.save();
    for (const gt of G.gravityTrails) {
      c.strokeStyle = "rgba(0, 245, 212, " + (gt.life / gt.maxLife * 0.18) + ")";
      c.lineWidth = 1.8 / z;
      c.setLineDash([8 / z, 8 / z]);
      c.beginPath(); c.arc(gt.x, gt.y, gt.r, 0, TAU); c.stroke();
    }
    c.restore();
  }

  c.setLineDash([]);
  /* objects */
  for (const o of G.objs) {
    if (Math.abs(o.x - p.x) > vr * (W / Math.min(W, H)) + o.r || Math.abs(o.y - p.y) > vr + o.r) continue;
    drawObject(c, o, t, z);
  }
  /* shots */
  for (const sh of G.shots) {
    if (sh.meteor) { // streaking tail
      c.strokeStyle = hexA("#ff8a4a", 0.45);
      c.lineWidth = sh.r * 0.9;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(sh.x, sh.y);
      c.lineTo(sh.x - sh.vx * 0.14, sh.y - sh.vy * 0.14);
      c.stroke();
    }
    c.beginPath(); c.arc(sh.x, sh.y, sh.r, 0, TAU);
    c.fillStyle = sh.c || "#ff6a6a"; c.fill();
    c.beginPath(); c.arc(sh.x, sh.y, sh.r * 0.5, 0, TAU);
    c.fillStyle = "#fff0f0"; c.fill();
  }
  /* player shots */
  if (G.playerShots) {
    for (const sh of G.playerShots) {
      c.beginPath(); c.arc(sh.x, sh.y, sh.r, 0, TAU);
      c.fillStyle = sh.c || "#00f5a0"; c.fill();
      c.beginPath(); c.arc(sh.x, sh.y, sh.r * 0.5, 0, TAU);
      c.fillStyle = "#ffffff"; c.fill();
    }
  }
  /* universe core */
  if (G.victoryCore) drawCore(c, G.victoryCore, t);
  /* boss */
  if (G.boss) drawBoss(c, G.boss, t);
  /* player */
  drawPlayer(c, t);
  /* particles */
  for (const pt of FX.parts) {
    c.globalAlpha = clamp(pt.life, 0, 1);
    c.fillStyle = pt.c;
    c.beginPath(); c.arc(pt.x, pt.y, pt.r * clamp(pt.life + 0.3, 0.2, 1), 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
  /* rings */
  for (const r of FX.rings) {
    c.globalAlpha = clamp(r.life, 0, 1) * 0.8;
    c.strokeStyle = r.c;
    c.lineWidth = r.w / z;
    c.beginPath(); c.arc(r.x, r.y, r.r, 0, TAU); c.stroke();
  }
  c.globalAlpha = 1;
  c.restore();

  /* Offscreen Threat Indicators (HUD Arrows) */
  if (G.state === "play") {
    const margin = 28;
    // 1. Offscreen Boss pointer
    if (G.boss) {
      const sx = (G.boss.x - p.x) * z + W / 2;
      const sy = (G.boss.y - p.y) * z + H / 2;
      if (sx < 0 || sx > W || sy < 0 || sy > H) {
        // Boss is offscreen! Render pointer.
        const angle = Math.atan2(sy - H / 2, sx - W / 2);
        const px = clamp(sx, margin, W - margin);
        const py = clamp(sy, margin, H - margin);
        
        c.save();
        c.translate(px, py);
        c.rotate(angle);
        
        // Draw red pulsing pointer triangle
        const pulse = 1 + 0.15 * Math.sin(t * 10);
        c.fillStyle = "#ff3a5e";
        c.beginPath();
        c.moveTo(12 * pulse, 0);
        c.lineTo(-6 * pulse, -10 * pulse);
        c.lineTo(-6 * pulse, 10 * pulse);
        c.closePath();
        c.fill();
        
        // Draw boss text label
        c.rotate(-angle); // un-rotate text so it sits upright
        c.font = "bold 9px Inter, sans-serif";
        c.fillStyle = "#ff3a5e";
        c.textAlign = "center";
        c.strokeStyle = "rgba(0,0,0,0.7)";
        c.lineWidth = 2.5;
        c.strokeText("BOSS", 0, 18);
        c.fillText("BOSS", 0, 18);
        c.restore();
      }
    }
    
    // 1.5. Offscreen Universe Core pointer
    if (G.victoryCore) {
      const sx = (G.victoryCore.x - p.x) * z + W / 2;
      const sy = (G.victoryCore.y - p.y) * z + H / 2;
      if (sx < 0 || sx > W || sy < 0 || sy > H) {
        const angle = Math.atan2(sy - H / 2, sx - W / 2);
        const px = clamp(sx, margin, W - margin);
        const py = clamp(sy, margin, H - margin);
        
        c.save();
        c.translate(px, py);
        c.rotate(angle);
        
        const pulse = 1 + 0.2 * Math.sin(t * 12);
        c.fillStyle = "#00f5d4";
        c.beginPath();
        c.moveTo(14 * pulse, 0);
        c.lineTo(-7 * pulse, -11 * pulse);
        c.lineTo(-7 * pulse, 11 * pulse);
        c.closePath();
        c.fill();
        
        c.rotate(-angle);
        c.font = "bold 9px Inter, sans-serif";
        c.fillStyle = "#00f5d4";
        c.textAlign = "center";
        c.strokeStyle = "rgba(0,0,0,0.7)";
        c.lineWidth = 2.5;
        c.strokeText("CORE", 0, 18);
        c.fillText("CORE", 0, 18);
        c.restore();
      }
    }
    
    // 2. Offscreen Shooters pointers
    let shooterCount = 0;
    for (const o of G.objs) {
      if (o.ai === "shooter" && shooterCount < 3) {
        const sx = (o.x - p.x) * z + W / 2;
        const sy = (o.y - p.y) * z + H / 2;
        if (sx < 0 || sx > W || sy < 0 || sy > H) {
          shooterCount++;
          const angle = Math.atan2(sy - H / 2, sx - W / 2);
          const px = clamp(sx, margin, W - margin);
          const py = clamp(sy, margin, H - margin);
          
          c.save();
          c.translate(px, py);
          c.rotate(angle);
          
          // Draw warning orange pointer triangle
          const pulse = 1 + 0.15 * Math.sin(t * 8 + shooterCount);
          c.fillStyle = "#ff9a3d";
          c.beginPath();
          c.moveTo(8 * pulse, 0);
          c.lineTo(-4 * pulse, -6 * pulse);
          c.lineTo(-4 * pulse, 6 * pulse);
          c.closePath();
          c.fill();
          
          // Draw warning text label
          c.rotate(-angle);
          c.font = "900 8px Inter, sans-serif";
          c.fillStyle = "#ff9a3d";
          c.textAlign = "center";
          c.strokeStyle = "rgba(0,0,0,0.7)";
          c.strokeText("!", 0, 14);
          c.fillText("!", 0, 14);
          c.restore();
        }
      }
    }
  }

  /* floating texts (screen space) */
  c.save();
  c.textAlign = "center";
  for (const tx of FX.texts) {
    const sx = (tx.x - p.x) * z + W / 2 + shx;
    const sy = (tx.y - p.y) * z + H / 2 + shy;
    if (sx < -80 || sx > W + 80 || sy < -40 || sy > H + 40) continue;
    c.globalAlpha = clamp(tx.life * 1.4, 0, 1);
    c.font = "800 " + Math.round(15 * tx.s) + "px Inter, system-ui, sans-serif";
    c.strokeStyle = "rgba(0,0,0,.6)"; c.lineWidth = 3;
    c.strokeText(tx.str, sx, sy);
    c.fillStyle = tx.c;
    c.fillText(tx.str, sx, sy);
  }
  c.restore();

  /* full-screen flash */
  if (FX.flash > 0 && !P.settings.reduced) {
    c.globalAlpha = FX.flash * 0.55;
    c.fillStyle = "#fff";
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 1;
  }
  /* low hp pulse */
  if (G.state === "play" && G.stats.hp / G.stats.maxHp < 0.3) {
    c.globalAlpha = 0.10 + 0.08 * Math.sin(t * 7);
    c.fillStyle = "#ff2040";
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 1;
  }
}

function renderMenuBg(c, t, mdt) {
  /* drifting motes behind the menu */
  if (!G.menuMotes) {
    G.menuMotes = [];
    for (let i = 0; i < 50; i++) G.menuMotes.push({ x: Math.random(), y: Math.random(), s: rand(1, 3), v: rand(4, 16), hue: pick([265, 110, 320, 195]) });
  }
  
  const mp = G.menuPlayer;
  const hasMouse = INPUT.active;
  if (mp && hasMouse) {
    const dx = INPUT.x - mp.x, dy = INPUT.y - mp.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) {
      const k = 1 - Math.pow(0.005, mdt);
      mp.x += dx * k;
      mp.y += dy * k;
    }
    mp.mouth = Math.max(0, mp.mouth - mdt * 3.2);
  }

  for (const m of G.menuMotes) {
    let my = mod(m.y * H - t * m.v, H + 40) - 20;
    const mx = m.x * W;
    
    // Collision detection with menu player
    if (mp && hasMouse) {
      const dx = mp.x - mx, dy = mp.y - my;
      if (dx * dx + dy * dy < (mp.r + m.s * 2.5) ** 2) {
        // Eat menu particle
        SFX.eat(0.18, 0);
        FX.burst(mx, my, "hsl(" + m.hue + ",80%,70%)", 5, 2, 2, 0.45);
        m.y = Math.random() * -0.1; // reset above top
        m.x = Math.random();
        mp.mouth = 0.6; // open mouth
        my = mod(m.y * H - t * m.v, H + 40) - 20;
      }
    }
    
    c.globalAlpha = 0.35;
    c.fillStyle = "hsl(" + m.hue + ",80%,70%)";
    c.beginPath(); c.arc(mx, my, m.s, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;

  // Draw the interactive menu player
  if (mp && hasMouse) {
    c.save();
    c.translate(mp.x, mp.y);
    
    // Pulsing glowing background
    const pulse = 1 + 0.08 * Math.sin(t * 5);
    drawGlow(c, "#00f5d4", 0, 0, mp.r * 2.4 * pulse, 0.22);
    
    // Draw cute blob body
    c.beginPath();
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU;
      const rr = mp.r * (1 + 0.07 * Math.sin(a * 3 + t * 4.5)) * pulse;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    c.fillStyle = "#00f5d4"; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = "rgba(0,0,0,0.4)"; c.stroke();
    
    // Draw tiny eyes tracking cursor
    const angle = Math.atan2(INPUT.y - mp.y, INPUT.x - mp.x);
    for (const sgn of [-1, 1]) {
      const ex = Math.cos(angle) * mp.r * 0.35 - Math.sin(angle) * mp.r * 0.26 * sgn;
      const ey = Math.sin(angle) * mp.r * 0.35 + Math.cos(angle) * mp.r * 0.26 * sgn;
      c.beginPath(); c.arc(ex, ey, 2.5, 0, TAU); c.fillStyle = "#fff"; c.fill();
      c.beginPath(); c.arc(ex + Math.cos(angle) * 0.8, ey + Math.sin(angle) * 0.8, 1.2, 0, TAU); c.fillStyle = "#111"; c.fill();
    }
    
    // Draw mouth
    const open = mp.mouth;
    c.fillStyle = "#1a0620";
    c.beginPath();
    c.arc(Math.cos(angle) * mp.r * 0.45, Math.sin(angle) * mp.r * 0.45, mp.r * (0.15 + open * 0.3), angle - 0.5 - open, angle + 0.5 + open);
    c.fill();
    
    c.restore();
  }
}

/* ============================================================
   MENUS — worlds, shop, achievements, settings
============================================================ */
function updateMenuChrome() {
  $("essenceMenu").textContent = fmtInt(P.essence) + " essence";
  $("essenceShop").textContent = fmtInt(P.essence) + " essence";
  const got = Object.keys(P.ach).length;
  $("bestLine").textContent = P.runs === 0 ? "EAT · GROW · EVOLVE · REPEAT" :
    "BEST " + fmtInt(P.bestScore) + "  ·  PEAK: " + EVOS[P.maxEvo].name.toUpperCase() + "  ·  " + got + "/" + ACH.length + " FEATS";
}

function buildWorldGrid() {
  const grid = $("worldGrid");
  grid.innerHTML = "";
  WORLDS.forEach(w => {
    const owned = !!P.worlds[w.id];
    const card = document.createElement("button");
    card.className = "world-card" + (P.world === w.id ? " sel" : "") + (owned ? "" : " locked");
    card.style.background = "linear-gradient(180deg," + w.grad[0] + "," + w.grad[1] + ")";
    card.innerHTML = '<div style="width:34px;height:34px;border-radius:50%;margin:0 auto 8px;background:' + w.tint + ';box-shadow:0 0 16px ' + w.tint + '"></div>' +
      '<div class="nm">' + w.name + '</div><div class="ds">' + w.desc + "</div>" +
      '<div class="price">' + (owned ? (P.world === w.id ? '<span style="color:var(--food);font-weight:800">SELECTED</span>' : '<span style="color:var(--dim)">Tap to select</span>')
        : '<span class="essence-chip">' + w.price + "</span>") + "</div>";
    card.onclick = () => {
      if (owned) { P.world = w.id; SFX.ui(); }
      else if (P.essence >= w.price) { P.essence -= w.price; P.worlds[w.id] = true; P.world = w.id; SFX.levelup(); toast("<b>" + w.name + "</b> is yours to devour", "success", "World Unlocked"); }
      else { SFX.hurt(); toast("Need <b>" + (w.price - P.essence) + "</b> more essence", "danger", "Shop"); return; }
      saveP(); buildWorldGrid(); updateMenuChrome(); checkAch();
    };
    grid.appendChild(card);
  });
}

let shopTab = "skins";
function buildShop() {
  checkShopDeal();
  const grid = $("shopGrid");
  grid.innerHTML = "";
  SHOP.filter(it => it.type === shopTab).forEach(it => {
    const owned = !!P.owned[it.id];
    const equipped = P.equippedSkin === it.id || P.equippedTrail === it.id;
    const tier = getShopItemTier(it);
    const card = document.createElement("button");
    card.className = "shop-card t-" + tier + (equipped ? " sel" : "") + (owned ? "" : " locked");
    
    let bubbleHtml = "";
    if (it.type === "skins") {
      bubbleHtml = '<div class="skin-bubble" style="background:' + it.color + '; box-shadow:0 0 12px ' + it.color + '"><div class="skin-pupil"></div></div>';
    } else if (it.type === "trails") {
      bubbleHtml = '<div class="trail-bubble" style="background:rgba(255,255,255,0.04); border:1px solid ' + it.color + '; box-shadow:inset 0 0 8px ' + it.color + '">' + getTrailSvg(it.id, it.color) + '</div>';
    } else if (it.type === "perks") {
      bubbleHtml = '<div class="perk-bubble" style="background:rgba(255,255,255,0.04); border:1px solid ' + it.color + '; box-shadow:0 0 10px ' + it.color + '">' + getPerkSvg(it.id, it.color) + '</div>';
    }
    
    card.innerHTML = bubbleHtml +
      '<div class="nm" style="font-size:13px; font-weight:800; margin-bottom:2px">' + it.name + '</div>' + 
      '<div class="ds" style="font-size:10px; color:var(--dim); line-height:1.3; min-height:24px; margin-bottom:4px">' + it.desc + '</div>' +
      '<div class="price" style="font-size:11px">' + (equipped ? '<span style="color:var(--food);font-weight:800">EQUIPPED</span>'
        : owned ? '<span style="color:var(--dim)">' + (it.type === "perks" ? "OWNED" : "EQUIP") + "</span>"
        : '<span class="essence-chip">' + it.price + "</span>") + "</div>";
        
    card.onclick = () => {
      if (!owned) {
        if (P.essence < it.price) { SFX.hurt(); toast("Need <b>" + (it.price - P.essence) + "</b> more essence", "danger", "Shop"); return; }
        P.essence -= it.price; P.owned[it.id] = true; SFX.levelup();
        toast("<b>" + it.name + "</b> added to your collection", "success", "Unlocked");
      } else SFX.ui();
      if (it.type === "skins") P.equippedSkin = it.id;
      if (it.type === "trails") P.equippedTrail = it.id;
      saveP(); buildShop(); updateMenuChrome(); checkAch();
    };
    
    card.onmouseenter = () => { hoveredShopItem = it; };
    card.onmouseleave = () => { if (hoveredShopItem === it) hoveredShopItem = null; };
    card.onfocus = () => { hoveredShopItem = it; };
    card.onblur = () => { if (hoveredShopItem === it) hoveredShopItem = null; };
    
    grid.appendChild(card);
  });
}

function buildAchList() {
  const got = Object.keys(P.ach).length;
  $("achProgress").textContent = got + " / " + ACH.length;
  const list = $("achList");
  list.innerHTML = "";
  const sorted = ACH.slice().sort((a, b) => (P.ach[b.id] ? 1 : 0) - (P.ach[a.id] ? 1 : 0));
  sorted.forEach(a => {
    const row = document.createElement("div");
    row.className = "ach-row" + (P.ach[a.id] ? " got" : "");
    const badgeSvg = getAchSvg(a.id, P.ach[a.id] ? "#00f5a0" : "var(--dim)");
    row.innerHTML = '<div class="ic" style="display:flex; align-items:center; justify-content:center">' + badgeSvg + '</div><div class="tx"><div class="nm">' + a.name +
      '</div><div class="ds">' + a.desc + '</div></div><div class="rw">+' + a.reward + "</div>";
    list.appendChild(row);
  });
}

/* ---------------- settings wiring ---------------- */
function applySettingsToUI() {
  $("sMaster").value = P.settings.master;
  $("sMusic").value = P.settings.music;
  $("sSfx").value = P.settings.sfx;
  $("sUi").value = P.settings.ui;
  $("sShake").classList.toggle("on", P.settings.shake);
  $("sReduced").classList.toggle("on", P.settings.reduced);
  $("sPerf").classList.toggle("on", P.settings.perf);
  $("sCb").classList.toggle("on", P.settings.cb);
  document.documentElement.style.setProperty("--ui-scale", P.settings.ui / 100);
}
function bindSettings() {
  const slide = (id, key) => { $(id).addEventListener("input", e => { P.settings[key] = +e.target.value; AudioSys.applyVolumes(); if (key === "ui") document.documentElement.style.setProperty("--ui-scale", P.settings.ui / 100); saveP(); }); };
  slide("sMaster", "master"); slide("sMusic", "music"); slide("sSfx", "sfx"); slide("sUi", "ui");
  const tog = (id, key, after) => { $(id).addEventListener("click", () => { P.settings[key] = !P.settings[key]; $(id).classList.toggle("on", P.settings[key]); $(id).setAttribute("aria-checked", P.settings[key]); SFX.ui(); saveP(); if (after) after(); }); };
  tog("sShake", "shake");
  tog("sReduced", "reduced");
  tog("sPerf", "perf", resize);
  tog("sCb", "cb");
  let armed = false;
  $("sReset").addEventListener("click", () => {
    if (!armed) { armed = true; $("sReset").textContent = "Sure?"; setTimeout(() => { armed = false; $("sReset").textContent = "Reset"; }, 2500); return; }
    Save.wipe(); P = Save.defaults();
    applySettingsToUI(); updateMenuChrome(); buildWorldGrid(); buildShop(); buildAchList();
    toast("Save erased — the Hunger forgets", "danger", "Reset");
  });
}

/* ---------------- screen buttons ---------------- */
const MODE_DESC = {
  standard: "Grow from a mote to the universe. Devour the final boss to win.",
  endless: "No ending. The boss ladder cycles forever, growing stronger each loop.",
  rush: "Start huge and face all 10 bosses back-to-back.",
  zen: "No damage, no bosses. Just you and an endless buffet."
};
function bindUI() {
  document.querySelectorAll(".mode-tab").forEach(tab => {
    tab.onclick = () => {
      SFX.ui();
      document.querySelectorAll(".mode-tab").forEach(t => {
        const isActive = (t === tab);
        t.classList.toggle("active", isActive);
        t.style.color = isActive ? "" : "var(--dim)";
      });
      selectedMode = tab.getAttribute("data-mode");
      const md = $("modeDesc");
      if (md) md.textContent = MODE_DESC[selectedMode] || "";
    };
  });

  $("playBtn").onclick = () => { AudioSys.unlock(); SFX.ui(); startRun(); };
  $("worldsBtn").onclick = () => { AudioSys.unlock(); SFX.ui(); buildWorldGrid(); show("worldsScreen"); };
  $("shopBtn").onclick = () => { AudioSys.unlock(); SFX.ui(); buildShop(); show("shopScreen"); };
  $("achBtn").onclick = () => { AudioSys.unlock(); SFX.ui(); buildAchList(); show("achScreen"); };
  $("settingsBtn").onclick = () => { AudioSys.unlock(); SFX.ui(); show("settingsScreen"); };
  document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => { SFX.ui(); hide(b.getAttribute("data-close")); updateMenuChrome(); });
  document.querySelectorAll("[data-shoptab]").forEach(b => b.onclick = () => {
    shopTab = b.getAttribute("data-shoptab"); SFX.ui();
    document.querySelectorAll("[data-shoptab]").forEach(x => x.classList.toggle("active", x === b));
    buildShop();
  });
  $("pauseBtn").onclick = togglePause;
  $("resumeBtn").onclick = togglePause;
  $("pauseSettingsBtn").onclick = () => { SFX.ui(); show("settingsScreen"); };
  $("quitBtn").onclick = () => {
    SFX.ui(); hide("pauseScreen"); hide("hud");
    finishRunCommon(); G.state = "menu";
    updateMenuChrome(); show("menuScreen");
  };
  $("retryBtn").onclick = () => { SFX.ui(); hide("gameOverScreen"); startRun(); };
  $("goMenuBtn").onclick = () => { SFX.ui(); hide("gameOverScreen"); G.state = "menu"; updateMenuChrome(); show("menuScreen"); };
  $("vRetryBtn").onclick = () => { SFX.ui(); hide("victoryScreen"); startRun(); };
  $("vMenuBtn").onclick = () => { SFX.ui(); hide("victoryScreen"); G.state = "menu"; updateMenuChrome(); show("menuScreen"); };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && G.state === "play") togglePause();
    if (!document.hidden) lastT = performance.now() / 1000;
  });
  const dealBuy = $("shopDealBuyBtn");
  if (dealBuy) {
    dealBuy.onclick = () => {
      if (!P.dealId) return;
      const it = SHOP.find(x => x.id === P.dealId);
      if (!it) return;
      const price = Math.max(1, Math.floor(it.price * 0.75));
      if (P.essence < price) {
        SFX.hurt();
        toast("Need <b>" + (price - P.essence) + "</b> more essence", "danger", "Shop");
        return;
      }
      P.essence -= price;
      P.owned[it.id] = true;
      SFX.levelup();
      toast("<b>" + it.name + "</b> claimed at a discount", "success", "Unlocked");
      P.dealId = null;
      P.dealExpires = 0;
      saveP();
      checkShopDeal();
      buildShop();
      updateMenuChrome();
      checkAch();
    };
  }
}

/* ============================================================
   MAIN LOOP + BOOT
============================================================ */
let lastT = 0;
let frameDt = 0.016;
function frame(ts) {
  requestAnimationFrame(frame);
  const now = ts / 1000;
  const rawDt = now - lastT;
  let dt = Math.min(rawDt, 0.05);
  if (!(dt > 0)) dt = 0.016;
  lastT = now;
  frameDt = dt;
  if (G.state === "play") Quality.sample(rawDt);
  let activeDt = dt;
  if (FX.hitstop > 0) { FX.hitstop -= dt; activeDt *= 0.1; }
  if (G.slowmoT > 0 && G.state === "play") { G.slowmoT -= dt; activeDt *= 0.35; }
  dt = activeDt;
  if (G.state === "play") update(dt);
  FX.update(dt);
  render();
  if (G.state === "play") refreshHud();
  
  // Update shop preview wiggler and timed discount timer when the shop overlay is active
  if (G.state === "menu" && !$("shopScreen").classList.contains("hidden")) {
    updateShopDealTimer();
    renderShopPreview();
  }
}

function boot() {
  resize();
  G.menuPlayer = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 12, mouth: 0 };
  applySettingsToUI();
  bindSettings();
  bindUI();
  updateMenuChrome();
  // periodic lifetime-achievement sweep (handles menu-time unlocks like Hoarder)
  setInterval(() => { if (G.state !== "play") checkAch(); }, 4000);
  requestAnimationFrame(frame);
}
boot();

/* ============================================================
   DRAWING — objects, boss, player
============================================================ */
function blobPath(c, r, t, wob, points, amp) {
  c.beginPath();
  const n = points || 10;
  for (let i = 0; i <= n; i++) {
    const a = i / n * TAU;
    const rr = r * (1 + (amp || 0.07) * Math.sin(t * 3 + wob + i * 1.9));
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
}
function shade(hex, f) { // f>1 lighten, f<1 darken
  if (!hex || hex[0] !== "#") return hex || "#888888";
  const v = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((v >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((v >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((v & 255) * f), 0, 255);
  return "rgb(" + r + "," + g + "," + b + ")";
}

function drawObject(c, o, t, z) {
  const p = G.player;
  const danger = o.r > p.r * (1 + G.stats.biteSize);
  c.save();
  c.translate(o.x, o.y);

  /* Draw visual mutation category vector above edible, non-dangerous consumable */
  if (o.shape && o.shape !== "shard" && !danger && !P.settings.perf) {
    c.save();
    const hover = Math.sin(t * 4 + o.wob) * Math.max(1.8, o.r * 0.1);
    c.translate(0, -o.r - Math.max(6, o.r * 0.3) + hover);
    
    if (o.shape === "blob") { // Organic: Sprout
      c.fillStyle = "#00f5a0";
      c.beginPath();
      c.ellipse(-1.5, 0, 2.2, 1.4, -Math.PI/4, 0, TAU);
      c.ellipse(1.5, 0, 2.2, 1.4, Math.PI/4, 0, TAU);
      c.fill();
      c.strokeStyle = "#00f5a0";
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(0, 1.5);
      c.quadraticCurveTo(0, 0, -0.8, -1.5);
      c.stroke();
    } else if (o.shape === "rect") { // Structural: Shield
      c.fillStyle = "#ff9a3d";
      c.beginPath();
      c.moveTo(0, -3.2);
      c.lineTo(3, -1.6);
      c.lineTo(2.4, 1.6);
      c.quadraticCurveTo(0, 3.2, 0, 3.2);
      c.quadraticCurveTo(-2.4, 1.6, -2.4, 1.6);
      c.lineTo(-3, -1.6);
      c.closePath();
      c.fill();
      c.strokeStyle = "#9c5a24";
      c.lineWidth = 0.8;
      c.stroke();
    } else if (o.shape === "poly") { // Kinetic: Spinning Propeller
      c.save();
      c.rotate(t * 8 + o.wob);
      c.fillStyle = "#00bbf9";
      c.fillRect(-4, -1, 8, 2);
      c.beginPath(); c.arc(0, 0, 1.2, 0, TAU); c.fillStyle = "#fff"; c.fill();
      c.restore();
    } else if (o.shape === "glow") { // Cosmic: Rotating Galaxy Swirl
      c.save();
      c.rotate(t * 4 + o.wob);
      c.strokeStyle = "#d946ef";
      c.lineWidth = 0.9;
      c.beginPath();
      c.arc(0, 0, 2, 0, Math.PI);
      c.stroke();
      c.beginPath();
      c.arc(0, 0, 3.5, Math.PI, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#fff";
      c.fillRect(-0.8, -0.8, 1.6, 1.6);
      c.restore();
    }
    c.restore();
  }
  /* threat ring */
  if (danger && o.shape !== "shard") {
    const pulse = 0.35 + 0.25 * Math.sin(t * 5 + o.wob);
    c.globalAlpha = pulse;
    c.strokeStyle = P.settings.cb ? "#ff9a3d" : "#ff3a5e";
    c.lineWidth = Math.max(o.r * 0.07, 1.2 / z);
    if (P.settings.cb) c.setLineDash([o.r * 0.25, o.r * 0.16]);
    c.beginPath(); c.arc(0, 0, o.r * 1.22, 0, TAU); c.stroke();
    c.setLineDash([]);
    if (P.settings.cb) { // pattern-coded "!" marker for colorblind players
      c.globalAlpha = 0.9;
      c.fillStyle = "#ff9a3d";
      c.font = "900 " + (o.r * 0.7) + "px sans-serif";
      c.textAlign = "center";
      c.fillText("!", 0, -o.r * 1.45);
    }
    c.globalAlpha = 1;
  }
  const col = o.color;

  /* Draw flagella tail for moving AI creatures */
  if (o.ai && (o.vx !== 0 || o.vy !== 0) && o.shape !== "shard" && !P.settings.perf) {
    const ang = Math.atan2(o.vy, o.vx);
    c.save();
    c.rotate(ang + Math.PI);
    c.beginPath();
    c.moveTo(o.r * 0.7, 0);
    const segments = 6;
    const tailLength = o.r * 1.1;
    c.lineWidth = o.r * 0.1;
    c.strokeStyle = shade(col, 0.65);
    c.lineCap = "round";
    c.lineJoin = "round";
    for (let i = 1; i <= segments; i++) {
      const ratio = i / segments;
      const lx = o.r * 0.7 + ratio * tailLength;
      const wiggle = o.r * 0.2 * Math.sin(t * 12 + o.wob + i * 0.8) * (1 - ratio * 0.3);
      c.lineTo(lx, wiggle);
    }
    c.stroke();
    c.restore();
  }

  /* squishy physics deformation for AI creatures */
  if (o.ai && (o.vx !== 0 || o.vy !== 0) && o.shape !== "shard") {
    const sp = Math.hypot(o.vx, o.vy);
    const squish = 1 + Math.min(sp / (o.r * 6), 0.15);
    const ang = Math.atan2(o.vy, o.vx);
    c.rotate(ang);
    c.scale(squish, 1 / squish);
    c.rotate(-ang);
  }
  if (o.shape === "shard") {
    const pl = 1 + 0.18 * Math.sin(t * 6 + o.wob);
    c.rotate(o.a);
    c.globalAlpha = clamp(o.life, 0, 1);
    c.fillStyle = hexA("#7cff6b", 0.25);
    c.beginPath(); c.arc(0, 0, o.r * 1.8 * pl, 0, TAU); c.fill();
    c.fillStyle = "#a6ff96";
    c.beginPath();
    c.moveTo(0, -o.r * pl); c.lineTo(o.r * 0.62 * pl, 0); c.lineTo(0, o.r * pl); c.lineTo(-o.r * 0.62 * pl, 0);
    c.closePath(); c.fill();
    c.fillStyle = "#eaffe4";
    c.beginPath();
    c.moveTo(0, -o.r * 0.5 * pl); c.lineTo(o.r * 0.3 * pl, 0); c.lineTo(0, o.r * 0.5 * pl); c.lineTo(-o.r * 0.3 * pl, 0);
    c.closePath(); c.fill();
    c.restore(); return;
  }
  if (o.shape === "glow") {
    const blackHole = o.name === "Black Hole" || o.name === "Wormhole" || o.name === "Dark Matter Cloud";
    if (!P.settings.perf) drawGlow(c, col, 0, 0, o.r * 1.9, blackHole ? 0.5 : 0.55);
    if (blackHole) {
      c.fillStyle = "#05030a";
      c.beginPath(); c.arc(0, 0, o.r * 0.85, 0, TAU); c.fill();
      c.strokeStyle = col; c.lineWidth = o.r * 0.13;
      c.beginPath(); c.arc(0, 0, o.r * 1.0, 0, TAU); c.stroke();
      c.save(); c.rotate(t * 0.7 + o.wob);
      c.strokeStyle = hexA(col, 0.5); c.lineWidth = o.r * 0.06;
      c.beginPath(); c.ellipse(0, 0, o.r * 1.5, o.r * 0.5, 0, 0, TAU); c.stroke();
      c.restore();
    } else {
      c.fillStyle = col;
      c.beginPath(); c.arc(0, 0, o.r * 0.9, 0, TAU); c.fill();
      c.fillStyle = shade(col, 1.45);
      c.beginPath(); c.arc(-o.r * 0.25, -o.r * 0.25, o.r * 0.45, 0, TAU); c.fill();
      if (o.name === "Ring World" || o.name === "Solar System" || o.name === "Spiral Galaxy") {
        c.save(); c.rotate(0.5 + o.wob);
        c.strokeStyle = hexA("#ffffff", 0.55); c.lineWidth = o.r * 0.08;
        c.beginPath(); c.ellipse(0, 0, o.r * 1.45, o.r * 0.45, 0, 0, TAU); c.stroke();
        c.restore();
      }
    }
    c.restore(); return;
  }
  if (o.shape === "rect") {
    c.rotate(Math.sin(o.a) * 0.05);
    const w = o.r * 1.75, h = o.r * 1.45;
    c.fillStyle = shade(col, 0.7);
    roundRect(c, -w / 2 + o.r * 0.05, -h / 2 + o.r * 0.07, w, h, o.r * 0.14); c.fill();
    c.fillStyle = col;
    roundRect(c, -w / 2, -h / 2, w, h, o.r * 0.14); c.fill();
    c.fillStyle = shade(col, 1.35);
    roundRect(c, -w / 2, -h / 2, w, h * 0.3, o.r * 0.14); c.fill();
    if (o.tier >= 9 && !P.settings.perf) { // windows
      c.fillStyle = "rgba(255,238,170,.5)";
      const cols = 3, rows = 3;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        if ((i * 7 + j * 3 + Math.floor(o.wob * 10)) % 3 === 0) continue;
        c.fillRect(-w / 2 + w * (0.14 + i * 0.3), -h / 2 + h * (0.18 + j * 0.27), w * 0.14, h * 0.13);
      }
    }
    c.restore(); return;
  }
  if (o.shape === "poly") {
    c.rotate(o.a);
    const n = 3 + (o.name.length % 4);
    c.fillStyle = col;
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU;
      const rr = o.r * (i % 2 ? 1 : 0.82);
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
    c.fillStyle = shade(col, 1.35);
    c.beginPath(); c.arc(-o.r * 0.2, -o.r * 0.2, o.r * 0.38, 0, TAU); c.fill();
    c.restore(); return;
  }
  /* blob (creatures + organic) */
  if (o.golden && !P.settings.perf) { // golden swarm shimmer
    drawGlow(c, "#ffd04a", 0, 0, o.r * 2, 0.3 + 0.12 * Math.sin(t * 6 + o.wob));
  }
  blobPath(c, o.r, t, o.wob, 9, o.ai ? 0.09 : 0.06);
  c.fillStyle = col; c.fill();
  c.lineWidth = o.r * 0.09;
  c.strokeStyle = shade(col, 0.65); c.stroke();
  c.fillStyle = shade(col, 1.35);
  c.beginPath(); c.arc(-o.r * 0.25, -o.r * 0.28, o.r * 0.4, 0, TAU); c.fill();
  if (o.ai) { // hostile face
    const a = Math.atan2(p.y - o.y, p.x - o.x);
    const ex = Math.cos(a) * o.r * 0.32, ey = Math.sin(a) * o.r * 0.32;
    for (const sgn of [-1, 1]) {
      const ox = ex + Math.cos(a + sgn * 1.25) * o.r * 0.3;
      const oy = ey + Math.sin(a + sgn * 1.25) * o.r * 0.3;
      c.fillStyle = "#fff";
      c.beginPath(); c.arc(ox, oy, o.r * 0.16, 0, TAU); c.fill();
      c.fillStyle = "#1a0d0d";
      c.beginPath(); c.arc(ox + Math.cos(a) * o.r * 0.05, oy + Math.sin(a) * o.r * 0.05, o.r * 0.08, 0, TAU); c.fill();
      /* angry brow */
      c.strokeStyle = shade(col, 0.45); c.lineWidth = o.r * 0.07;
      c.beginPath();
      c.moveTo(ox - o.r * 0.14 * sgn, oy - o.r * 0.2);
      c.lineTo(ox + o.r * 0.12 * sgn, oy - o.r * 0.05);
      c.stroke();
    }
    if (o.stun > 0) {
      c.fillStyle = "#ffe89a"; c.font = "900 " + o.r * 0.5 + "px sans-serif"; c.textAlign = "center";
      c.fillText("✦", 0, -o.r * 1.3);
    }
  } else if (o.tier <= 7) { // tiny innocent eye for small critters
    c.fillStyle = "rgba(0,0,0,.4)";
    c.beginPath(); c.arc(o.r * 0.3, -o.r * 0.1, o.r * 0.1, 0, TAU); c.fill();
  }
  c.restore();
}

function drawBoss(c, b, t) {
  c.save();
  c.translate(b.x, b.y);
  /* telegraph */
  if (b.phase === "windup") {
    const p = G.player;
    const a = Math.atan2(p.y - b.y, p.x - b.x);
    c.save(); c.rotate(a);
    c.globalAlpha = 0.25 + 0.2 * Math.sin(t * 18);
    c.fillStyle = "#ff3a5e";
    c.beginPath();
    c.moveTo(b.r * 0.6, -b.r * 0.45); c.lineTo(b.r * 5, 0); c.lineTo(b.r * 0.6, b.r * 0.45);
    c.closePath(); c.fill();
    c.restore();
    c.globalAlpha = 1;
    c.translate(rand(-1, 1) * b.r * 0.04, rand(-1, 1) * b.r * 0.04);
  }
  /* aura — burns hotter with each phase */
  if (!P.settings.perf) {
    const ph = b.phaseIdx || 0;
    drawGlow(c, b.color, 0, 0, b.r * (2.1 + ph * 0.3), 0.28 + ph * 0.1);
  }
  /* the final boss carries a rotating halo of light rays */
  if (b.def.final && !P.settings.perf) {
    c.save();
    c.rotate(-t * 0.3);
    c.strokeStyle = hexA(b.color, 0.3 + 0.1 * Math.sin(t * 3));
    c.lineWidth = b.r * 0.06;
    c.lineCap = "round";
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      c.beginPath();
      c.moveTo(Math.cos(a) * b.r * 1.45, Math.sin(a) * b.r * 1.45);
      c.lineTo(Math.cos(a) * b.r * (2.1 + 0.2 * Math.sin(t * 4 + i)), Math.sin(a) * b.r * (2.1 + 0.2 * Math.sin(t * 4 + i)));
      c.stroke();
    }
    c.restore();
    /* gravity well cue while collapsing */
    if ((b.phaseIdx || 0) >= 1) {
      c.save();
      c.rotate(t * 0.8);
      c.strokeStyle = hexA(b.color, 0.18);
      c.lineWidth = b.r * 0.04;
      c.setLineDash([b.r * 0.3, b.r * 0.25]);
      c.beginPath(); c.arc(0, 0, b.r * 2.6, 0, TAU); c.stroke();
      c.setLineDash([]);
      c.restore();
    }
  }
  /* spikes */
  c.save(); c.rotate(t * 0.4);
  c.fillStyle = shade(b.color, 0.6);
  const ns = 13;
  for (let i = 0; i < ns; i++) {
    const a = i / ns * TAU;
    const L = b.r * (1.3 + 0.1 * Math.sin(t * 4 + i));
    c.beginPath();
    c.moveTo(Math.cos(a - 0.13) * b.r * 0.9, Math.sin(a - 0.13) * b.r * 0.9);
    c.lineTo(Math.cos(a) * L, Math.sin(a) * L);
    c.lineTo(Math.cos(a + 0.13) * b.r * 0.9, Math.sin(a + 0.13) * b.r * 0.9);
    c.closePath(); c.fill();
  }
  c.restore();
  /* body */
  blobPath(c, b.r, t, b.wob, 14, 0.05);
  c.fillStyle = b.hitFlash > 0 ? "#ffffff" : b.color;
  c.fill();
  c.lineWidth = b.r * 0.07;
  c.strokeStyle = shade(b.color, 0.55); c.stroke();
  c.fillStyle = hexA("#ffffff", 0.18);
  c.beginPath(); c.arc(-b.r * 0.25, -b.r * 0.3, b.r * 0.45, 0, TAU); c.fill();
  /* single great eye, tracking the player */
  const p = G.player;
  const a = Math.atan2(p.y - b.y, p.x - b.x);
  c.fillStyle = "#fff";
  c.beginPath(); c.arc(Math.cos(a) * b.r * 0.25, Math.sin(a) * b.r * 0.25, b.r * 0.3, 0, TAU); c.fill();
  c.fillStyle = "#7a0820";
  c.beginPath(); c.arc(Math.cos(a) * b.r * 0.36, Math.sin(a) * b.r * 0.36, b.r * 0.15, 0, TAU); c.fill();
  c.fillStyle = "#1a0208";
  c.beginPath(); c.arc(Math.cos(a) * b.r * 0.39, Math.sin(a) * b.r * 0.39, b.r * 0.07, 0, TAU); c.fill();
  /* fleeing sweat */
  if (b.fleeT > 0) {
    c.fillStyle = "#9adfff";
    c.beginPath(); c.arc(-Math.cos(a) * b.r * 0.6, -Math.sin(a) * b.r * 0.6 - b.r * 0.4, b.r * 0.09, 0, TAU); c.fill();
  }
  c.restore();
}

function drawCore(c, core, t) {
  const pl = 1 + 0.12 * Math.sin(t * 3);
  c.save();
  c.translate(core.x, core.y);
  if (!P.settings.perf) drawGlow(c, "#fff0a0", 0, 0, core.r * 3 * pl, 0.6);
  c.fillStyle = "#fff7d8";
  c.beginPath(); c.arc(0, 0, core.r * 0.85 * pl, 0, TAU); c.fill();
  c.strokeStyle = "#ffd04a"; c.lineWidth = core.r * 0.08;
  for (let i = 0; i < 3; i++) {
    c.save(); c.rotate(t * (0.4 + i * 0.25) + i * 2);
    c.beginPath(); c.ellipse(0, 0, core.r * (1.2 + i * 0.3) * pl, core.r * (0.5 + i * 0.12) * pl, 0, 0, TAU); c.stroke();
    c.restore();
  }
  c.restore();
}

function drawPlayer(c, t) {
  const p = G.player, evo = EVOS[G.evoIndex];
  const skin = SHOP.find(x => x.id === P.equippedSkin);
  const col = skin ? skin.color : "#00f5d4";
  if (p.iframe > 0 && Math.floor(t * 14) % 2) return; // i-frame blink
  c.save();
  c.translate(p.x, p.y);

  /* Blood Rage / Afterburn Aura */
  if ((p.rageT > 0 || p.dashT > 0) && !P.settings.perf) {
    const pulse = 1 + 0.15 * Math.sin(t * 12);
    drawGlow(c, p.dashT > 0 ? "#8ae8ff" : "#ff3a5e", 0, 0, p.r * 2.2 * pulse, p.dashT > 0 ? 0.4 : 0.45);
  }

  /* Magnet attraction range circle */
  if (G.state === "play" && G.stats.magnet > 1.0) {
    const magR = p.r * 2.6 * G.stats.magnet;
    const pulse = 1 + 0.02 * Math.sin(t * 4);
    c.strokeStyle = "rgba(0,245,212,0.085)"; 
    c.lineWidth = 1.8 / camZoom();
    c.setLineDash([12 / camZoom(), 12 / camZoom()]);
    c.beginPath(); c.arc(0, 0, magR * pulse, 0, TAU); c.stroke();
    c.setLineDash([]);
  }

  /* cosmic aura at late evolutions */
  if (G.evoIndex >= 13 && !P.settings.perf) {
    drawGlow(c, col, 0, 0, p.r * 2.4, 0.06 + evo.aura * 0.22);
    c.save(); c.rotate(t * 0.5);
    c.strokeStyle = hexA(col, 0.4);
    c.lineWidth = p.r * 0.05;
    c.setLineDash([p.r * 0.3, p.r * 0.22]);
    c.beginPath(); c.arc(0, 0, p.r * 1.5, 0, TAU); c.stroke();
    c.setLineDash([]);
    c.restore();
  }
  /* thorns spikes */
  if (G.stats.thorns > 0) {
    c.save();
    c.rotate(p.faceA - t * 0.22); // rotate opposite to default spikes
    c.fillStyle = "#ff4d5e";
    const ts = 6 + Math.floor(G.stats.thorns * 8); // number of spines based on upgrade level
    const lenMult = 0.15 + G.stats.thorns * 0.1; // spine length scales with level
    for (let i = 0; i < ts; i++) {
      const a = (i / ts * TAU) + Math.PI / ts; // offset angle so they sit between skin spikes
      const L = p.r * (1.1 + lenMult * Math.sin(t * 6 + i));
      c.save(); c.rotate(a);
      c.beginPath();
      c.moveTo(p.r * 0.9, -p.r * 0.05);
      c.lineTo(p.r + L * 0.25, 0);
      c.lineTo(p.r * 0.9, p.r * 0.05);
      c.fill();
      c.restore();
    }
    c.restore();
  }

  /* flagella tail */
  if (!P.settings.perf) {
    c.save();
    c.rotate(p.faceA + Math.PI);
    c.beginPath();
    c.moveTo(p.r * 0.7, 0);
    const segments = 10;
    const tailLength = p.r * 1.5;
    c.lineWidth = p.r * 0.12;
    c.strokeStyle = shade(col, 0.55);
    c.lineCap = "round";
    c.lineJoin = "round";
    for (let i = 1; i <= segments; i++) {
      const ratio = i / segments;
      const lx = p.r * 0.7 + ratio * tailLength;
      const wiggle = p.r * 0.28 * Math.sin(t * 15 - i * 0.6) * (1 - ratio * 0.3);
      c.lineTo(lx, wiggle);
    }
    c.stroke();
    c.restore();
  }

  /* spikes — more with each evolution */
  c.save(); c.rotate(p.faceA + t * 0.15);
  c.fillStyle = shade(col, 0.62);
  const ns = evo.spikes;
  for (let i = 0; i < ns; i++) {
    const a = i / ns * TAU;
    const L = p.r * (1.18 + 0.07 * Math.sin(t * 5 + i * 2));
    c.beginPath();
    c.moveTo(Math.cos(a - 0.16) * p.r * 0.88, Math.sin(a - 0.16) * p.r * 0.88);
    c.lineTo(Math.cos(a) * L, Math.sin(a) * L);
    c.lineTo(Math.cos(a + 0.16) * p.r * 0.88, Math.sin(a + 0.16) * p.r * 0.88);
    c.closePath(); c.fill();
  }
  c.restore();
  /* body */
  const squish = 1 + Math.min(Math.hypot(p.vx, p.vy) / (p.r * 6), 0.15);
  c.save(); c.rotate(p.faceA); c.scale(squish, 1 / squish);
  blobPath(c, p.r, t, p.wob, 12, 0.06);
  c.fillStyle = p.hurtT > 0 ? "#ff5a7a" : col;
  c.fill();
  c.lineWidth = p.r * 0.07;
  c.strokeStyle = shade(col, 0.55); c.stroke();
  c.fillStyle = hexA("#ffffff", 0.22);
  c.beginPath(); c.arc(-p.r * 0.22, -p.r * 0.3, p.r * 0.5, 0, TAU); c.fill();
  /* mouth — opens when eating */
  const open = 0.12 + p.mouth * 0.55;
  c.fillStyle = "#1a0620";
  c.beginPath();
  c.moveTo(p.r * 0.25, 0);
  c.arc(p.r * 0.25, 0, p.r * 0.62, -open, open);
  c.closePath(); c.fill();
  if (p.mouth > 0.2) { // teeth
    c.fillStyle = "#fff";
    for (const sgn of [-1, 1]) {
      c.beginPath();
      c.moveTo(p.r * 0.45, sgn * p.r * 0.30 * open * 1.6);
      c.lineTo(p.r * 0.62, sgn * p.r * 0.14 * open * 1.6);
      c.lineTo(p.r * 0.78, sgn * p.r * 0.34 * open * 1.6);
      c.closePath(); c.fill();
    }
  }
  /* eyes — multiply as you evolve */
  const eyeN = G.evoIndex >= 16 ? 5 : G.evoIndex >= 9 ? 3 : 2;
  for (let i = 0; i < eyeN; i++) {
    const spread = (i - (eyeN - 1) / 2) * 0.55;
    const ex = Math.cos(spread) * p.r * 0.32 - p.r * 0.15;
    const ey = Math.sin(spread) * p.r * 0.52;
    const er = p.r * (i === Math.floor(eyeN / 2) ? 0.17 : 0.12);
    c.fillStyle = "#fff";
    c.beginPath(); c.arc(ex, ey, er, 0, TAU); c.fill();
    c.fillStyle = G.evoIndex >= 13 ? col : "#1a0d1f";
    c.beginPath(); c.arc(ex + er * 0.35, ey, er * 0.55, 0, TAU); c.fill();
    c.fillStyle = "#fff";
    c.beginPath(); c.arc(ex + er * 0.45, ey - er * 0.2, er * 0.18, 0, TAU); c.fill();
  }
  c.restore();
  c.restore();
}