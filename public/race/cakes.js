// 55 unique kawaii cake characters for the race game

const CAKES = [
  // Red/Pink cakes (1-10)
  { id: 1, name: "Red Velvet Dream", bodyColor: "#DC143C", frostingColor: "#FFFFFF", toppingColor: "#8B0000" },
  { id: 2, name: "Strawberry Swirl", bodyColor: "#FFB6C1", frostingColor: "#FF1493", toppingColor: "#C71585" },
  { id: 3, name: "Cherry Bomb", bodyColor: "#DE3163", frostingColor: "#FFE4E1", toppingColor: "#DC143C" },
  { id: 4, name: "Raspberry Delight", bodyColor: "#E30B5D", frostingColor: "#F0E68C", toppingColor: "#8B008B" },
  { id: 5, name: "Watermelon Wonder", bodyColor: "#FF6B6B", frostingColor: "#90EE90", toppingColor: "#2D5016" },
  { id: 6, name: "Pink Lemonade", bodyColor: "#FF69B4", frostingColor: "#FFFFE0", toppingColor: "#FFD700" },
  { id: 7, name: "Rose Petal", bodyColor: "#FF007F", frostingColor: "#FFF0F5", toppingColor: "#FF1493" },
  { id: 8, name: "Bubblegum Blast", bodyColor: "#FFC1CC", frostingColor: "#FF69B4", toppingColor: "#FF1493" },
  { id: 9, name: "Cranberry Crush", bodyColor: "#9B111E", frostingColor: "#F5DEB3", toppingColor: "#DC143C" },
  { id: 10, name: "Cotton Candy Cloud", bodyColor: "#FFBCD9", frostingColor: "#B19CD9", toppingColor: "#DDA0DD" },

  // Blue/Purple cakes (11-20)
  { id: 11, name: "Blueberry Bliss", bodyColor: "#4169E1", frostingColor: "#E6E6FA", toppingColor: "#0000CD" },
  { id: 12, name: "Lavender Love", bodyColor: "#967BB6", frostingColor: "#E6E6FA", toppingColor: "#663399" },
  { id: 13, name: "Midnight Dream", bodyColor: "#191970", frostingColor: "#87CEEB", toppingColor: "#FFD700" },
  { id: 14, name: "Purple Haze", bodyColor: "#9966CC", frostingColor: "#DDA0DD", toppingColor: "#8B008B" },
  { id: 15, name: "Grape Gum", bodyColor: "#6F00FF", frostingColor: "#E6E6FA", toppingColor: "#9370DB" },
  { id: 16, name: "Periwinkle Pop", bodyColor: "#CCCCFF", frostingColor: "#FFB6C1", toppingColor: "#FF1493" },
  { id: 17, name: "Indigo Ink", bodyColor: "#4B0082", frostingColor: "#F0E68C", toppingColor: "#9370DB" },
  { id: 18, name: "Sapphire Spark", bodyColor: "#0F52BA", frostingColor: "#FFFFFF", toppingColor: "#FFD700" },
  { id: 19, name: "Violet Velvet", bodyColor: "#8F00FF", frostingColor: "#FFB6C1", toppingColor: "#FF1493" },
  { id: 20, name: "Periwinkle Paradise", bodyColor: "#89CFF0", frostingColor: "#FFFFE0", toppingColor: "#1E90FF" },

  // Yellow/Orange cakes (21-30)
  { id: 21, name: "Lemon Zest", bodyColor: "#FFF44F", frostingColor: "#FFFFFF", toppingColor: "#FFD700" },
  { id: 22, name: "Orange Crush", bodyColor: "#FFA500", frostingColor: "#FAEBD7", toppingColor: "#FF4500" },
  { id: 23, name: "Banana Bonanza", bodyColor: "#FFE135", frostingColor: "#8B4513", toppingColor: "#654321" },
  { id: 24, name: "Mango Tango", bodyColor: "#FFC324", frostingColor: "#FF6347", toppingColor: "#FF4500" },
  { id: 25, name: "Pineapple Party", bodyColor: "#FFD700", frostingColor: "#90EE90", toppingColor: "#228B22" },
  { id: 26, name: "Peach Perfection", bodyColor: "#FFDAB9", frostingColor: "#FFB6C1", toppingColor: "#FF69B4" },
  { id: 27, name: "Apricot Affair", bodyColor: "#FBCEB1", frostingColor: "#FF8C00", toppingColor: "#8B4513" },
  { id: 28, name: "Tangerine Twist", bodyColor: "#F28500", frostingColor: "#FFE4B5", toppingColor: "#DC143C" },
  { id: 29, name: "Golden Honey", bodyColor: "#FFD700", frostingColor: "#8B4513", toppingColor: "#654321" },
  { id: 30, name: "Sunshine Shimmer", bodyColor: "#FFD300", frostingColor: "#FF69B4", toppingColor: "#FF1493" },

  // Green cakes (31-37)
  { id: 31, name: "Matcha Magic", bodyColor: "#88D66C", frostingColor: "#F0FFF0", toppingColor: "#DC143C" },
  { id: 32, name: "Mint Chip", bodyColor: "#98FF98", frostingColor: "#8B4513", toppingColor: "#654321" },
  { id: 33, name: "Pistachio Pow", bodyColor: "#93C572", frostingColor: "#F5DEB3", toppingColor: "#A0522D" },
  { id: 34, name: "Lime Lime", bodyColor: "#32CD32", frostingColor: "#FFFFE0", toppingColor: "#FFD700" },
  { id: 35, name: "Kiwi Kiss", bodyColor: "#8FBC8F", frostingColor: "#FFB6C1", toppingColor: "#FF69B4" },
  { id: 36, name: "Avocado Awesome", bodyColor: "#568203", frostingColor: "#F5DEB3", toppingColor: "#8B0000" },
  { id: 37, name: "Emerald Envy", bodyColor: "#50C878", frostingColor: "#FFD700", toppingColor: "#FF4500" },

  // Brown/Chocolate cakes (38-45)
  { id: 38, name: "Chocolate Thunder", bodyColor: "#7B3F00", frostingColor: "#FFB6C1", toppingColor: "#DC143C" },
  { id: 39, name: "Mocha Madness", bodyColor: "#6F4E37", frostingColor: "#F5DEB3", toppingColor: "#4E342E" },
  { id: 40, name: "Caramel Cascade", bodyColor: "#D4A574", frostingColor: "#8B4513", toppingColor: "#654321" },
  { id: 41, name: "Coffee Cake Craze", bodyColor: "#6F4E37", frostingColor: "#FFFACD", toppingColor: "#FFD700" },
  { id: 42, name: "Hazelnut Heaven", bodyColor: "#8B7355", frostingColor: "#90EE90", toppingColor: "#228B22" },
  { id: 43, name: "Walnut Whirl", bodyColor: "#773F1A", frostingColor: "#E6E6FA", toppingColor: "#9370DB" },
  { id: 44, name: "Cocoa Crunch", bodyColor: "#D2691E", frostingColor: "#87CEEB", toppingColor: "#4169E1" },
  { id: 45, name: "Tiramisu Twist", bodyColor: "#C19A6B", frostingColor: "#8B4513", toppingColor: "#DC143C" },

  // Special/Multi-color cakes (46-55)
  { id: 46, name: "Rainbow Rocket", bodyColor: "#FF6B9D", frostingColor: "#89CFF0", toppingColor: "#FFD700" },
  { id: 47, name: "Funfetti Frenzy", bodyColor: "#FAEBD7", frostingColor: "#FF69B4", toppingColor: "#4169E1" },
  { id: 48, name: "Unicorn Dream", bodyColor: "#E0BBE4", frostingColor: "#87CEEB", toppingColor: "#FFD700" },
  { id: 49, name: "Galaxy Glaze", bodyColor: "#191970", frostingColor: "#9370DB", toppingColor: "#FFD700" },
  { id: 50, name: "Confetti Celebration", bodyColor: "#FFFFE0", frostingColor: "#FF69B4", toppingColor: "#FF4500" },
  { id: 51, name: "Ice Cream Sundae", bodyColor: "#F5DEB3", frostingColor: "#FFB6C1", toppingColor: "#DC143C" },
  { id: 52, name: "S'mores Surprise", bodyColor: "#D2691E", frostingColor: "#F5F5F5", toppingColor: "#8B4513" },
  { id: 53, name: "Birthday Blast", bodyColor: "#FFD700", frostingColor: "#FF1493", toppingColor: "#4169E1" },
  { id: 54, name: "Neapolitan", bodyColor: "#8B4513", frostingColor: "#FFB6C1", toppingColor: "#90EE90" },
  { id: 55, name: "Wedding White", bodyColor: "#FFFFFF", frostingColor: "#FFD700", toppingColor: "#FF1493" }
];

// Generate medium-detail kawaii SVG for a cake
function generateCakeSVG(cake) {
  // Simple variation based on ID
  const topperType = ['cherry', 'hat', 'candle'][cake.id % 3];

  let topperSVG = '';
  if (topperType === 'cherry') {
    topperSVG = `
      <circle cx="50" cy="38" r="9" fill="${cake.toppingColor}" stroke="#333" stroke-width="1"/>
      <ellipse cx="52" cy="36" rx="3" ry="2" fill="rgba(255,255,255,0.4)"/>
      <path d="M 50,38 Q 48,30 46,25" stroke="#228B22" stroke-width="2" fill="none"/>
    `;
  } else if (topperType === 'hat') {
    topperSVG = `
      <ellipse cx="50" cy="40" rx="12" ry="3" fill="${cake.toppingColor}" stroke="#333" stroke-width="1"/>
      <path d="M 42,40 Q 44,30 50,28 Q 56,30 58,40 Z" fill="${cake.toppingColor}" stroke="#333" stroke-width="1"/>
      <rect x="44" y="35" width="12" height="3" rx="1.5" fill="${cake.frostingColor}" stroke="#333" stroke-width="0.8"/>
    `;
  } else {
    topperSVG = `
      <rect x="47" y="25" width="6" height="17" rx="2" fill="${cake.toppingColor}" stroke="#333" stroke-width="1"/>
      <path d="M 47,30 H 53 M 47,35 H 53" stroke="${cake.frostingColor}" stroke-width="0.8"/>
      <path d="M 50,18 Q 54,23 50,26 Q 46,23 50,18 Z" fill="#ff9f1c" stroke="#333" stroke-width="0.8"/>
      <path d="M 50,20 Q 52,22 50,24 Q 48,22 50,20 Z" fill="#fff4a3"/>
    `;
  }

  return `
    <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" class="cake-svg">
      <!-- Shadow -->
      <ellipse cx="50" cy="115" rx="45" ry="8" fill="rgba(0,0,0,0.1)"/>

      <!-- Cake body -->
      <ellipse cx="50" cy="70" rx="40" ry="30" fill="${cake.bodyColor}" stroke="#333" stroke-width="1.5"/>

      <!-- Frosting layer with drips -->
      <path d="M 10,50
               Q 15,40 20,38
               Q 25,36 30,38
               Q 35,36 40,38
               Q 45,36 50,38
               Q 55,36 60,38
               Q 65,36 70,38
               Q 75,36 80,38
               Q 85,40 90,50
               L 88,58 Q 87,62 85,62 L 83,62 Q 82,62 82,58 L 82,55
               Q 78,58 74,58 L 72,58 Q 71,58 71,55 L 71,52
               Q 66,56 62,56 L 60,56 Q 59,56 59,53 L 59,51
               Q 55,54 51,54 L 49,54 Q 48,54 48,51 L 48,50
               Q 44,53 40,53 L 38,53 Q 37,53 37,50 L 37,52
               Q 33,56 29,56 L 27,56 Q 26,56 26,53 L 26,55
               Q 22,58 18,58 L 16,58 Q 15,58 15,55 L 12,58
               Z"
            fill="${cake.frostingColor}" stroke="#333" stroke-width="1"/>

      <!-- Kawaii face -->
      <!-- Left eye -->
      <circle cx="35" cy="65" r="3.5" fill="#000"/>
      <circle cx="36" cy="64" r="1" fill="#FFF"/>

      <!-- Right eye -->
      <circle cx="65" cy="65" r="3.5" fill="#000"/>
      <circle cx="66" cy="64" r="1" fill="#FFF"/>

      <!-- Blushing cheeks -->
      <ellipse cx="25" cy="70" rx="5" ry="3" fill="#FFB6C1" opacity="0.5"/>
      <ellipse cx="75" cy="70" rx="5" ry="3" fill="#FFB6C1" opacity="0.5"/>

      <!-- Happy smile -->
      <path d="M 35,80 Q 50,88 65,80" stroke="#000" fill="none" stroke-width="2" stroke-linecap="round"/>

      <!-- Topper (cherry, hat, or candle) -->
      ${topperSVG}

      <!-- Legs -->
      <rect x="33" y="90" width="10" height="25" rx="5" fill="#8B4513" stroke="#654321" stroke-width="1"/>
      <rect x="57" y="90" width="10" height="25" rx="5" fill="#8B4513" stroke="#654321" stroke-width="1"/>

      <!-- Feet -->
      <ellipse cx="38" cy="115" rx="8" ry="5" fill="#654321" stroke="#3E2723" stroke-width="1"/>
      <ellipse cx="62" cy="115" rx="8" ry="5" fill="#654321" stroke="#3E2723" stroke-width="1"/>

      <!-- Shoe highlights -->
      <ellipse cx="40" cy="113" rx="3" ry="2" fill="rgba(255,255,255,0.2)"/>
      <ellipse cx="64" cy="113" rx="3" ry="2" fill="rgba(255,255,255,0.2)"/>
    </svg>
  `;
}

// Get cake by ID
function getCakeById(id) {
  return CAKES.find(cake => cake.id === id);
}

// Get all available cake IDs
function getAllCakeIds() {
  return CAKES.map(cake => cake.id);
}
