export const SERVICE_CHARGE_RATE = 0.10;

// Admin PIN hash (SHA-256 of "1947")
export const ADMIN_PIN_HASH = '8eec27653c19ed078b2f3bae16ff901d16347d7917d2b8e2317914e2437bf324';

export const hashPIN = async (pin) => {
  const data = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
};

export const DAILY_SPECIALS = {
  0: { title: "Sunday Start", items: ["Brownie", "Doppio"], tagline: "Sweeten the start of your week." },
  1: { title: "Monday Motivation", items: ["Chicken Sandwich", "Iced Americano"], tagline: "Fuel up right." },
  2: { title: "Tuesday Tastes", items: ["Veg Steam Momo", "Virgin Mojito"], tagline: "Light, fresh, and perfect." },
  3: { title: "Wednesday Wings", items: ["Spicy Chicken Wings", "Virgin Mojito"], tagline: "Hump day relief." },
  4: { title: "Thursday Thrill", items: ["Chicken Pizza", "Coca-Cola"], tagline: "A classic combo." },
  5: { title: "Friday Feast", items: ["Chicken Special Momo Platter", "Mango Juice"], tagline: "Share the joy." },
  6: { title: "Saturday Slowdown", items: ["Satkar Special Latte", "Red Velvet Cake"], tagline: "Take your time today." },
};

export const INCLUDED_SIGNATURE_NAMES = [
  "Chicken Steam Momo", "Chicken Jhol Momo", "Veg Steam Momo", "Chicken Special Momo Platter", "Mango Juice", "Spicy Chicken Wings", "Drumstick", "Virgin Mojito", "Blue Iceland", "Satkar Special Latte", "Espresso", "Chicken Burger", "Chicken Noodles", "Chicken Pizza"
];

export const subCategoryMap = {
  coffee: "Coffee", tea: "Tea", shakes: "Shakes", soft_drinks: "Soft Drinks", juices: "Juices", mocktails: "Mocktails",
  hard_drinks: "Hard Drinks", beer: "Beer", tequila: "Tequila", wines: "Wines", hookah: "Hookah",
  veg_momo: "Veg Mo:Mo", chicken_momo: "Chicken Mo:Mo", fried_rice: "Fried Rice", noodles: "Noodles", pizza: "Pizza", combo_set: "Combo Set",
  veg_items: "Veg Items", soups: "Soups", sandwich: "Sandwich", burger: "Burger", sadheko: "Sadheko", starter: "Starter", drumstick: "Drumstick", 
  bakery_items: "Bakery Items", breads: "Breads", cookies_and_donut: "Cookies & Donut", dessert: "Dessert"
};

export const catMap = { beverages: "Beverages", bar: "Bar", hookah: "Hookah", main_eats: "Main Eats", snack_and_starters: "Snacks & Starters", bakery: "Bakery & Desserts" };

export const INITIAL_CATEGORIES = [
  { id: "Main Eats", label: "Main Eats", icon: "soup", desc: "Mo:Mo, Pizza, Rice" },
  { id: "Beverages", label: "Beverages", icon: "droplets", desc: "Coffee, Tea, Shakes" },
  { id: "Bakery & Desserts", label: "Bakery", icon: "leaf", desc: "Cakes, Breads, Desserts" },
  { id: "Snacks & Starters", label: "Snacks", icon: "box", desc: "Burgers, Starters, Wings" },
  { id: "Bar", label: "Bar", icon: "glass", desc: "Beer, Wines, Spirits" },
  { id: "Hookah", label: "Hookah", icon: "wind", desc: "Premium Flavors & Clouds" }
];

export const PAIRING_MATRIX = {
  coffee: ['Brownie', 'Pastry', 'Chicken Sandwich'],
  tea: ['Veg Sandwich', 'Plain Donut'],
  shakes: ['French Fries', 'Satkar Special Cookies'],
  mocktails: ['Spicy Chicken Wings', 'French Fries'],
  hard_drinks: ['Peanut Sadheko', 'Spicy Chicken Wings'],
  beer: ['Chicken Chilly', 'Paneer Chilly'],
  hookah: ['French Fries', 'Virgin Mojito'],
  chicken_momo: ['Virgin Mojito', 'Coca-Cola'],
  pizza: ['Coca-Cola', 'Tuborg Strong (330ML)'],
  bakery_items: ['Espresso', 'Cappuccino'],
  soups: ['Chicken Sandwich', 'Satkar Special Bread'],
  sandwich: ['Espresso', 'Cappuccino'],
  burger: ['Coca-Cola', 'French Fries'],
  starter: ['Virgin Mojito', 'Blue Iceland'],
  drumstick: ['Tuborg Strong (330ML)', 'Lemonade'],
  sadheko: ['Masala Tea', 'Peach Ice Tea'],
  tequila: ['French Fries', 'Paneer Chilly'],
  wines: ['Chicken Pizza', 'Non-Veg Mix Pizza'],
  veg_items: ['Masala Sprite', 'Lemonade'],
  fried_rice: ['Chicken Soup', 'Virgin Mojito'],
  noodles: ['Chicken Hot & Sour Soup', 'Coca-Cola'],
  combo_set: ['Virgin Mojito', 'Blue Iceland'],
  dessert: ['Espresso', 'Satkar Special Latte'],
  breads: ['Milk Tea', 'Cappuccino'],
  veg_momo: ['Lemonade', 'Masala Sprite'],
  soft_drinks: ['French Fries', 'Plain Donut'],
  juices: ['Satkar Special Cookies', 'Brownie'],
  cookies_and_donut: ['Milk Tea', 'Espresso']
};

export const RAW_MENU = {
  "data": {
    "beverages": {
      "tea": [ {"name":"Milk Tea","price":50}, {"name":"Black Tea","price":40}, {"name":"Lemon Tea","price":40}, {"name":"Green Tea","price":50}, {"name":"Masala Tea","price":60} ],
      "coffee": [ {"name":"Espresso","price":90}, {"name":"Doppio","price":120}, {"name":"Americano Single Shot","price":110}, {"name":"Americano Double Shot","price":150}, {"name":"Cappuccino","price":150}, {"name":"Satkar Special Latte","price":160}, {"name":"Mocha","price":180}, {"name":"Flat White","price":140}, {"name":"Hot Chocolate","price":180}, {"name":"Iced Americano","price":160}, {"name":"Iced Latte","price":180}, {"name":"Iced Cappuccino","price":180}, {"name":"Iced Mocha","price":220}, {"name":"Frappe (Chocolate / Caramel / Vanilla)","price":250}, {"name":"Affogato","price":220} ],
      "shakes": [ {"name":"Banana Milk Shake","price":145}, {"name":"Oreo Milk Shake","price":145}, {"name":"Vanilla Milk Shake","price":160}, {"name":"Chocolate Milk Shake","price":160}, {"name":"Strawberry Milk Shake","price":180} ],
      "soft_drinks": [ {"name":"Coca-Cola","price":60}, {"name":"Fanta","price":60}, {"name":"Sprite","price":60}, {"name":"Redbull","price":150}, {"name":"Badam Juice","price":150}, {"name":"Kibu","price":130}, {"name":"Apple Cider","price":250} ],
      "juices": [ {"name":"Guava Juice","price":120}, {"name":"Mix Juice","price":130}, {"name":"Pomegranate Juice","price":140}, {"name":"Mango Juice","price":150}, {"name":"Watermelon Juice","price":120} ],
      "mocktails": [ {"name":"Virgin Mojito","price":160}, {"name":"Blue Iceland","price":150}, {"name":"Peach Ice Tea","price":140}, {"name":"Lemonade","price":150}, {"name":"Masala Sprite","price":100} ]
    },
    "bar": {
      "hard_drinks": [ {"name":"Blue Diamond (30ml)","price":75}, {"name":"Blue Diamond (60ml)","price":140}, {"name":"Blue Diamond (180ml)","price":400}, {"name":"Blue Diamond (Bottle)","price":1500}, {"name":"Golden Oak (30ml)","price":75}, {"name":"Golden Oak (60ml)","price":150}, {"name":"Golden Oak (180ml)","price":450}, {"name":"Golden Oak (Bottle)","price":1700}, {"name":"Virgin (30ml)","price":65}, {"name":"Virgin (60ml)","price":120}, {"name":"Virgin (180ml)","price":360}, {"name":"Virgin (Bottle)","price":1400}, {"name":"8848 Vodka (30ml)","price":110}, {"name":"8848 Vodka (60ml)","price":200}, {"name":"8848 Vodka (180ml)","price":650}, {"name":"8848 Vodka (Bottle)","price":2500}, {"name":"Ruslan Vodka (30ml)","price":110}, {"name":"Ruslan Vodka (60ml)","price":220}, {"name":"Ruslan Vodka (180ml)","price":650}, {"name":"Ruslan Vodka (Bottle)","price":2500}, {"name":"Nude Vodka (30ml)","price":110}, {"name":"Nude Vodka (60ml)","price":220}, {"name":"Nude Vodka (180ml)","price":650}, {"name":"Nude Vodka (Bottle)","price":2500}, {"name":"Khukri Rum (30ml)","price":110}, {"name":"Khukri Rum (60ml)","price":220}, {"name":"Khukri Rum (180ml)","price":650}, {"name":"Khukri Rum (Bottle)","price":2500}, {"name":"Old Durbar (GO) (30ml)","price":150}, {"name":"Old Durbar (GO) (60ml)","price":300}, {"name":"Old Durbar (GO) (180ml)","price":900}, {"name":"Old Durbar (GO) (Bottle)","price":3600}, {"name":"Old Durbar Black (30ml)","price":175}, {"name":"Old Durbar Black (60ml)","price":350}, {"name":"Old Durbar Black (180ml)","price":1050}, {"name":"Old Durbar Black (Bottle)","price":4200}, {"name":"Signature (30ml)","price":130}, {"name":"Signature (60ml)","price":260}, {"name":"Signature (180ml)","price":750}, {"name":"Signature (Bottle)","price":3100}, {"name":"Black Label (30ml)","price":420}, {"name":"Black Label (60ml)","price":835}, {"name":"Black Label (180ml)","price":2500}, {"name":"Black Label (Bottle)","price":10000}, {"name":"Red Label (30ml)","price":400}, {"name":"Red Label (60ml)","price":800}, {"name":"Red Label (180ml)","price":2400}, {"name":"Red Label (Bottle)","price":9600}, {"name":"Jack Daniels (30ml)","price":420}, {"name":"Jack Daniels (60ml)","price":835}, {"name":"Jack Daniels (180ml)","price":2500}, {"name":"Jack Daniels (Bottle)","price":10000} ],
      "beer": [ {"name":"Tuborg Strong (650ML)","price":500}, {"name":"Tuborg Strong (330ML)","price":250}, {"name":"Tuborg Gold (650ML)","price":500}, {"name":"Tuborg Gold (330ML)","price":280}, {"name":"Gorkha Strong (650ML)","price":500}, {"name":"Gorkha Strong (330ML)","price":250}, {"name":"Carlsberg (650ML)","price":600} ],
      "tequila": [ {"name":"Silver Tequila (Shot)","price":400}, {"name":"Jacker Bomb (Shot)","price":465}, {"name":"Gold Tequila (Shot)","price":400} ],
      "wines": [ {"name":"White / Red / King Hill (Bottle)","price":1300}, {"name":"Manang (Bottle)","price":1150}, {"name":"Jp Chenet / White / Red (Bottle)","price":2800}, {"name":"Robertson (Bottle)","price":3200} ]
    },
    "hookah": {
      "hookah_flavors": [ {"name":"Mint Flavor (Normal)","price":450}, {"name":"Mint Flavor (Cloud)","price":550}, {"name":"Double Apple (Normal)","price":450}, {"name":"Double Apple (Cloud)","price":550}, {"name":"1001 Night (Normal)","price":450}, {"name":"1001 Night (Cloud)","price":550}, {"name":"Orange (Normal)","price":450}, {"name":"Orange (Cloud)","price":550}, {"name":"Chocolate (Normal)","price":450}, {"name":"Chocolate (Cloud)","price":550} ]
    },
    "main_eats": {
      "veg_momo": [ {"name":"Veg Steam Momo","price":170}, {"name":"Veg Fried Momo","price":195}, {"name":"Veg Sadeko Momo","price":200}, {"name":"Veg Jhol Momo","price":195}, {"name":"Veg Kothey Momo","price":215}, {"name":"Veg Chilly Momo","price":235}, {"name":"Veg C Momo","price":220} ],
      "chicken_momo": [ {"name":"Chicken Steam Momo","price":185}, {"name":"Chicken Fried Momo","price":215}, {"name":"Chicken Sadeko Momo","price":235}, {"name":"Chicken Jhol Momo","price":215}, {"name":"Chicken Kothey Momo","price":235}, {"name":"Chicken Chilly Momo","price":255}, {"name":"Chicken C Momo","price":255}, {"name":"Chicken Special Momo Platter","price":800} ],
      "fried_rice": [ {"name":"Egg Fried Rice (Half)","price":120}, {"name":"Egg Fried Rice (Full)","price":160}, {"name":"Chicken Fried Rice (Half)","price":130}, {"name":"Chicken Fried Rice (Full)","price":180}, {"name":"Veg Fried Rice (Half)","price":80}, {"name":"Veg Fried Rice (Full)","price":150}, {"name":"Veg Schezwan Fried Rice (Full)","price":175}, {"name":"Chicken Schezwan Fried Rice (Full)","price":215} ],
      "noodles": [ {"name":"Chicken Noodles (Half)","price":130}, {"name":"Chicken Noodles (Full)","price":180}, {"name":"Egg Noodles (Half)","price":120}, {"name":"Egg Noodles (Full)","price":150}, {"name":"Chicken Schezwan Noodles (Full)","price":215}, {"name":"Chicken Thukpa","price":160}, {"name":"Veg Noodles (Half)","price":80}, {"name":"Veg Noodles (Full)","price":150}, {"name":"Veg Schezwan Noodles (Full)","price":175}, {"name":"Veg Thukpa","price":150} ],
      "pizza": [ {"name":"Chicken Pizza","price":460}, {"name":"Non-Veg Mix Pizza","price":550}, {"name":"Veg Pizza","price":420}, {"name":"Cheese Pizza","price":380}, {"name":"Mushroom Pizza","price":400}, {"name":"Paneer Pizza","price":450}, {"name":"Veg Mix Pizza","price":450} ],
      "combo_set": [ {"name":"Mini Combo Set","price":1050,"desc":"Chicken Pizza / Chicken Burger / French Fry / Coke 500ml / Pastry"}, {"name":"Chicken Combo Set","price":1499,"desc":"Chicken Pizza or Veg Pizza / Chicken Burger / Drumstick / Chicken Rice or Chicken Noodle / Sausage / Coke / French Fry"}, {"name":"Small Combo Set","price":499,"desc":"Chicken Noodle or Chicken Rice / Chilly Momo / Fry Momo / Steam Momo / Virgin Mojito / Mineral Water"} ]
    },
    "snack_and_starters": {
      "veg_items": [ {"name":"Paneer Chilly","price":350}, {"name":"Mushroom Chilly","price":295}, {"name":"Chips Chilly","price":200}, {"name":"Veg Pakoda","price":215}, {"name":"Paneer Pakoda","price":340} ],
      "soups": [ {"name":"Chicken Soup","price":136}, {"name":"Chicken Hot & Sour Soup","price":145}, {"name":"Veg Soup","price":120}, {"name":"Veg Hot & Sour Soup","price":130}, {"name":"Mushroom Soup","price":120} ],
      "sandwich": [ {"name":"Chicken Sandwich","price":200}, {"name":"Veg Sandwich","price":150} ],
      "burger": [ {"name":"Chicken Burger","price":200}, {"name":"Veg Burger","price":150}, {"name":"Egg Burger","price":150} ],
      "sadheko": [ {"name":"Peanut Sadheko","price":150}, {"name":"Wai Wai Sadheko","price":100}, {"name":"Chicken Sadheko","price":250} ],
      "starter": [ {"name":"French Fries","price":150}, {"name":"Corn Salt & Pepper","price":150}, {"name":"Spicy Chicken Wings","price":395}, {"name":"Chicken Chilly","price":360}, {"name":"Chicken Sausage","price":320} ],
      "drumstick": [ {"name":"Drumstick","price":350}, {"name":"Oriental Style Drumstick","price":395} ]
    },
    "bakery": {
      "bakery_items": [ {"name":"Black Forest Cake","price":600}, {"name":"Butterscotch Cake","price":650}, {"name":"White Forest Cake","price":600}, {"name":"Vanilla Cream Cake","price":650}, {"name":"Strawberry Cake","price":650}, {"name":"Pineapple Cake","price":650}, {"name":"Chocolate Cake","price":900}, {"name":"Red Velvet Cake","price":1600} ],
      "breads": [ {"name":"Satkar Special Bread","price":85}, {"name":"White Bread","price":85} ],
      "cookies_and_donut": [ {"name":"Satkar Special Cookies","price":60}, {"name":"Chocolate Cookies","price":55}, {"name":"Plain Donut","price":20}, {"name":"Cream Donut","price":40}, {"name":"Chocolate Donut","price":50} ],
      "dessert": [ {"name":"Pastry","price":85}, {"name":"Brownie","price":150}, {"name":"Chocolava Cake","price":195}, {"name":"Satkar Special Muffins","price":40} ]
    }
  }
};

const LOCAL_PHOTOS = ["affogato","americanodoubleshot","americanosingleshot","applecider","bananamilkshake","blackforestcake","blacktea","bluediamond180ml","bluediamond30ml","bluediamond60ml","bluediamondbottle","blueiceland","brownie","butterscotchcake","cappuccino","cheesepizza","chickenburger","chickenchillymomo","chickencmomo","chickenfriedmomo","chickenfriedricefull","chickenfriedricehalf","chickenhot&soursoup","chickenjholmomo","chickenkotheymomo","chickenpizza","chickensadeko","chickensadekomomo","chickensandwich","chickensausage","chickenschezwanfriedricefull","chickenschezwanfriedricehalf","chickensoup","chickensteammomo","chickenthupka","chickenwings","chocolatecake","chocolatedonut","chocolatemilkshake","chocolavacake","cocacola","cornsalt&pepper","creamdonut","doppio","drumstick","eggburger","eggfriedricefull","eggfriedricehalf","espresso","fanta","flatwhite","frappe","frenchfries","goldenoak","goldenoak180ml","goldenoak30ml","goldenoak60ml","greentea","guavajuice","hotchocolate","icedamericano","icedcappuccino","icedlatte","icedmocha","kibu","lemonade","lemontea","mangojuice","masalatea","milktea","mixfruitjuice","mocha","mushroomchilly","mushroompizza","mushroomsoup","nonvegmixpizza","oreomilkshake","paneerchilly","paneerpizza","peachicetea","pineapplecake","plaindonut","pomegranatejuice","redbull","spicychickenwings","sprite","strawberrycake","strawberrymilkshake","vanillacreamcake","vanillamilkshake","vegburger","vegchillymomo","vegcmomo","vegfriedmomo","vegfriedricefull","vegfriedricehalf","veghot&soursoup","vegjholmomo","vegkotheymomo","vegmixpizza","vegpakoda","vegpizza","vegsadekomomo","vegsandwich","vegschezwanfriedricefull","vegschezwanfriedricehalf","vegsoup","vegsteammomo","vegthupka","virginmojito","waiwaisadeko","watermelonjiuce","whiteforestcake"];

const getFallbackImage = (name, category) => {
  const url = (id) => `https://images.unsplash.com/${id}?w=300&q=70&fm=webp&auto=format&fit=crop`;
  const n = name.toLowerCase();
  if (n.includes('espresso') || n.includes('americano') || n.includes('doppio') || n.includes('black')) return url('photo-1510591509098-f4fdc6d0ff04');
  if (n.includes('matcha')) return url('photo-1515823064-26cbbe5d4f48');
  if (n.includes('iced') && n.includes('latte')) return url('photo-1517701550927-30cf4ba1dba1');
  if (n.includes('iced')) return url('photo-1499961024600-ad094db305cc');
  if (n.includes('cappuccino') || n.includes('latte') || n.includes('mocha') || n.includes('choco') || n.includes('macchiato') || n.includes('frappe')) return url('photo-1534040385115-33df4cf70bfa');
  if (n.includes('lemon tea')) return url('photo-1558160074-4d7d8bdf4256');
  if (n.includes('peach')) return url('photo-1556679343-c7306c1976bc');
  if (n.includes('tea')) return url('photo-1576092768241-dec231879bfc');
  if (n.includes('orange')) return url('photo-1622597467836-f38b29df2914');
  if (n.includes('pineapple') || n.includes('juice') || n.includes('water')) return url('photo-1600271886742-f049cd451bba');
  if (n.includes('lemonade')) return url('photo-1513558161293-cdaf765ed2fd');
  if (n.includes('mojito') || n.includes('mocktail') || n.includes('lagoon') || n.includes('sunrise') || n.includes('cindrella')) return url('photo-1536935338788-2cb6d953df41');
  if (n.includes('shake') || n.includes('lassi')) return url('photo-1572490122747-3968bacc56af');
  if (n.includes('smoothie') || n.includes('avocado') || n.includes('madness') || n.includes('pink') || n.includes('strawnana') || n.includes('papaya') || n.includes('fantastic')) return url('photo-1553530666-ba11a7da3888');
  if (n.includes('momo') && (n.includes('veg') || n.includes('kodo'))) return url('photo-1563227812-0ea4c22e6cc8');
  if (n.includes('momo') || n.includes('platter')) return url('photo-1496116218417-1a781b1c416c');
  if (n.includes('rice')) return url('photo-1603133872878-684f208fb84b');
  if (n.includes('noodle') || n.includes('chowmein') || n.includes('thukpa') || n.includes('laphing')) return url('photo-1569050467447-ce54b3bbc37d');
  if (n.includes('ramen')) return url('photo-1569718212165-3a8278d5f624');
  if (n.includes('pizza')) return url('photo-1513104890138-7c749659a591');
  if (n.includes('waffle')) return url('photo-1567620905732-2d1ec7ab7445');
  if (n.includes('brownie')) return url('photo-1564355808539-22fda35bed7e');
  if (n.includes('cake') || n.includes('pastry') || n.includes('muffin')) return url('photo-1578985545062-69928b1d9587');
  if (n.includes('ice cream')) return url('photo-1563805042-7684c019e1cb');
  if (n.includes('fruit bowl') || n.includes('fruit')) return url('photo-1490474418585-ba9bad8fd0ea');
  if (n.includes('pancake') || n.includes('pan cake')) return url('photo-1528207776546-365bb710ee93');
  if (n.includes('sandwich')) return url('photo-1528735602780-2552fd46c7af');
  if (n.includes('omelette') || n.includes('egg') || n.includes('sunny')) return url('photo-1510693206972-df098062cb71');
  if (n.includes('roll') || n.includes('tortilla')) return url('photo-1626700051175-6818013e1d4f');
  if (n.includes('burger')) return url('photo-1568901346375-23c9450c58cd');
  if (n.includes('wing') || n.includes('lollipop') || n.includes('chicken chilly')) return url('photo-1527477396000-e27163b481c2');
  if (n.includes('fries') || n.includes('french')) return url('photo-1630384060421-cb20aefbe284');
  if (n.includes('sausage')) return url('photo-1585238341710-4d3ff484b2c6');
  if (n.includes('soup')) return url('photo-1547592166-23ac45744acd');
  if (n.includes('paneer')) return url('photo-1626844379742-8e3d4a3c01d2');
  if (n.includes('pause')) return url('photo-1484980972926-edee96e0960d');
  if (n.includes('hookah') || n.includes('flavor')) return url('photo-1568285521742-b9e38d975a6c');
  if (n.includes('beer') || n.includes('tuborg') || n.includes('gorkha') || n.includes('carlsberg')) return url('photo-1535958636474-b021ee887b13');
  if (n.includes('wine') || n.includes('hill') || n.includes('manang')) return url('photo-1510812431401-41d2bd2722f3');
  if (n.includes('tequila') || n.includes('jacker') || n.includes('shot')) return url('photo-1560512823-829485b8823c');
  if (category === 'Bar & Hookah') return url('photo-1514362545857-3bc16c4c7d1b');
  return url('photo-1546069901-ba9599a7e63c');
};

export function getExactImage(name, category) {
  const formattedName = name.toLowerCase().replace(/[^a-z0-9&]/g, '');
  
  let fn = formattedName;
  if (fn === 'watermelonjuice') fn = 'watermelonjiuce';
  if (fn === 'chickenthukpa') fn = 'chickenthupka';
  if (fn === 'vegthukpa') fn = 'vegthupka';
  if (fn === 'chickensadheko') fn = 'chickensadeko';
  if (fn === 'waiwaisadheko') fn = 'waiwaisadeko';

  if (LOCAL_PHOTOS.includes(fn)) {
    return `/menu_item_photos/${fn}.jpg`;
  }
  
  return getFallbackImage(name, category);
}

export const isSignature = n => INCLUDED_SIGNATURE_NAMES.includes(n);

export const isVeg = (n, sub) => {
  const l = n.toLowerCase();
  if (sub === 'hard_drinks' || sub === 'beer' || sub === 'tequila' || sub === 'wines' || sub === 'hookah') return false;
  return !(l.includes('chicken')||l.includes('non-veg')||l.includes('hot wing')||l.includes('sausage')||l.includes('lollipop')||l.includes('egg')||l.includes('omelette')||l.includes('sunny side')||l.includes('vodka')||l.includes('rum')||l.includes('whisky')||l.includes('tequila')||l.includes('beer')||l.includes('tuborg')||l.includes('gorkha')||l.includes('carlsberg')||l.includes('wine')||l.includes('label')||l.includes('durbar')||l.includes('diamond')||l.includes('hookah')||l.includes('flavor'));
};

export const inferPrepTime = (n, sub) => {
  const l = n.toLowerCase();
  if (l.includes('tea ') || l === 'black tea' || l === 'lemon tea' || l === 'milk tea' || l.includes('cold drink') || l.includes('mineral water') || l === 'sausage') return 'instant';
  if (l.includes('espresso') || l.includes('americano') || l.includes('lemonade') || sub === 'juices' || sub === 'laphing' || sub === 'beer' || sub === 'wines' || sub === 'hard_drinks' || sub === 'tequila' || l.includes('fries')) return 'fast';
  if (l.includes('waffle') || l.includes('platter') || l.includes('ramentic bowl') || sub === 'hookah' || sub === 'pizza') return 'slow';
  return 'medium';
};

export const prepTimeMinutes = (pt) => ({ instant: '~2 min', fast: '~5 min', medium: '~10 min', slow: '~15 min' }[pt] || '~10 min');

export const prepTimeNum = (pt) => ({ instant: 2, fast: 5, medium: 10, slow: 15 }[pt] || 10);

export const inferFlavorProfile = n => {
  const l = n.toLowerCase(); let fp = [];
  if (l.includes('chilly') || l.includes('chatpate') || l.includes('jhol') || l.includes('hot wing') || l.includes('masala') || l.includes('lollipop') || l.includes('potato chilly') || l.includes('paneer chilly') || l.includes('schezwan')) fp.push('spicy');
  if (l.includes('chicken') || l.includes('keema') || l.includes('platter') || l.includes('laphing') || l.includes('chowmein') || l.includes('noodle') || l.includes('burger') || l.includes('roll') || l.includes('sandwich') || l.includes('pizza') || l.includes('drumstick')) fp.push('umami');
  if (l.includes('iced') || l.includes('juice') || l.includes('lemonade') || l.includes('mocktail') || l.includes('smoothie') || l.includes('shake') || l.includes('lassi') || l.includes('coconut') || l.includes('fresh mint') || l.includes('cold') || l.includes('beer') || l.includes('wine') || l.includes('tequila')) fp.push('cooling');
  if (l.includes('coffee') || l.includes('tea') || l.includes('matcha') || l.includes('cappuccino') || l.includes('latte') || l.includes('mocha') || l.includes('milk tea') || l.includes('hot & sour soup') || l.includes('ramen') || l.includes('espresso') || l.includes('hookah')) fp.push('thermogenic');
  if (l.includes('waffle') || l.includes('brownie') || l.includes('ice cream') || l.includes('shake') || l.includes('smoothie') || l.includes('lassi') || l.includes('mango') || l.includes('fruit') || l.includes('affogato') || l.includes('matcha latte') || l.includes('nutella') || l.includes('peanut butter') || l.includes('choco') || l.includes('banana') || l.includes('cake') || l.includes('cookie') || l.includes('donut') || l.includes('pastry')) fp.push('sweet');
  return fp;
};

export const generateSensoryHook = sub => {
  const h = { coffee: "Freshly pulled shots, rich with crema and deep roast.", tea: "Brewed with care - simple, honest, and soothing.", matcha: "Vibrant ceremonial matcha, earthy, smooth, and grounding.", juices: "Pressed to order, nothing but cold, pure fruit.", mocktails: "Layered, chilled, and dangerously easy to sip.", soft_drinks: "Bright citrus, sparkling and ice-cold.", shakes: "Creamy, cold, and deeply satisfying.", chicken_momo: "Handfolded dumplings, juicy chicken inside, served fresh.", veg_momo: "Soft wrappers around a warm, spiced vegetable filling.", fried_rice: "Wok-tossed with heat, fragrant and filling.", noodles: "Wok-tossed with heat, fragrant and filling.", pizza: "Hot from the oven, melted cheese and crisp crust.", bakery_items: "A quiet indulgence. A proper ending.", cookies_and_donut: "Sweet bites to share or keep to yourself.", burger: "Grilled, assembled with care, and made for eating right now.", sandwich: "Grilled, assembled with care, and made for eating right now.", starter: "Crispy, bold, and ideal for the table to share.", hookah: "Smooth clouds, bold flavors, slow hours.", hard_drinks: "The top shelf. Poured neat, or on the rocks.", beer: "Ice cold. Crisp, refreshing, classic.", tequila: "Salt, lime, and heat.", wines: "Grapes from the valley, rested and rich." };
  return h[sub] || "The essentials.";
};

export const INITIAL_STATIC_MENU = [];
let gi = 0;
for (const [topCat, subCats] of Object.entries(RAW_MENU.data)) {
  for (const [subCat, items] of Object.entries(subCats)) {
    items.forEach((item, index) => {
      INITIAL_STATIC_MENU.push({
        id: `${topCat}_${subCat}_${index}_${gi++}`, name: item.name, price: item.price, category: catMap[topCat],
        subCategory: subCat, subCategoryLabel: subCategoryMap[subCat] || subCat,
        imageUrl: getExactImage(item.name, catMap[topCat]), description: generateSensoryHook(subCat),
        isVegetarian: isVeg(item.name, subCat), isSignatureItem: isSignature(item.name), inStock: true,
        prepTime: inferPrepTime(item.name, subCat), flavorProfile: inferFlavorProfile(item.name)
      });
    });
  }
}
