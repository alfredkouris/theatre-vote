// 55 unique kawaii cake characters for the race game

const CAKES = [
  // Red/Pink cakes (1-10)
  { id: 1, name: "Red Velvet Dream", bodyColor: "#DC143C", frostingColor: "#FFFFFF", toppingColor: "#FF1493" },
  { id: 2, name: "Strawberry Swirl", bodyColor: "#FFB6C1", frostingColor: "#FFC0CB", toppingColor: "#FF69B4" },
  { id: 3, name: "Cherry Bomb", bodyColor: "#DE3163", frostingColor: "#FFFFFF", toppingColor: "#C41E3A" },
  { id: 4, name: "Raspberry Delight", bodyColor: "#E30B5D", frostingColor: "#FFE4E1", toppingColor: "#D70040" },
  { id: 5, name: "Watermelon Wonder", bodyColor: "#FC6C85", frostingColor: "#90EE90", toppingColor: "#000000" },
  { id: 6, name: "Pink Lemonade", bodyColor: "#FF6FD8", frostingColor: "#FFF8DC", toppingColor: "#FFD700" },
  { id: 7, name: "Rose Petal", bodyColor: "#FF007F", frostingColor: "#FFF0F5", toppingColor: "#C71585" },
  { id: 8, name: "Bubblegum Blast", bodyColor: "#FFC1CC", frostingColor: "#FFFFFF", toppingColor: "#FF1493" },
  { id: 9, name: "Cranberry Crush", bodyColor: "#9B111E", frostingColor: "#F5DEB3", toppingColor: "#8B0000" },
  { id: 10, name: "Cotton Candy Cloud", bodyColor: "#FFBCD9", frostingColor: "#E0BBE4", toppingColor: "#FF69B4" },

  // Blue/Purple cakes (11-20)
  { id: 11, name: "Blueberry Bliss", bodyColor: "#4169E1", frostingColor: "#E6E6FA", toppingColor: "#0000CD" },
  { id: 12, name: "Lavender Love", bodyColor: "#967BB6", frostingColor: "#DDA0DD", toppingColor: "#9370DB" },
  { id: 13, name: "Midnight Dream", bodyColor: "#191970", frostingColor: "#F0F8FF", toppingColor: "#4169E1" },
  { id: 14, name: "Purple Haze", bodyColor: "#9966CC", frostingColor: "#E6E6FA", toppingColor: "#663399" },
  { id: 15, name: "Grape Gum", bodyColor: "#6F00FF", frostingColor: "#FFFFFF", toppingColor: "#8B008B" },
  { id: 16, name: "Periwinkle Pop", bodyColor: "#CCCCFF", frostingColor: "#E0BBE4", toppingColor: "#967BB6" },
  { id: 17, name: "Indigo Ink", bodyColor: "#4B0082", frostingColor: "#F5F5DC", toppingColor: "#9370DB" },
  { id: 18, name: "Sapphire Spark", bodyColor: "#0F52BA", frostingColor: "#FFFFFF", toppingColor: "#082567" },
  { id: 19, name: "Violet Velvet", bodyColor: "#8F00FF", frostingColor: "#DDA0DD", toppingColor: "#9400D3" },
  { id: 20, name: "Periwinkle Paradise", bodyColor: "#89CFF0", frostingColor: "#FFFFFF", toppingColor: "#1E90FF" },

  // Yellow/Orange cakes (21-30)
  { id: 21, name: "Lemon Zest", bodyColor: "#FFF44F", frostingColor: "#FFFFF0", toppingColor: "#FFD700" },
  { id: 22, name: "Orange Crush", bodyColor: "#FFA500", frostingColor: "#FAEBD7", toppingColor: "#FF8C00" },
  { id: 23, name: "Banana Bonanza", bodyColor: "#FFE135", frostingColor: "#FFFACD", toppingColor: "#F0E68C" },
  { id: 24, name: "Mango Tango", bodyColor: "#FFC324", frostingColor: "#FFEFD5", toppingColor: "#FF8C00" },
  { id: 25, name: "Pineapple Party", bodyColor: "#FFD700", frostingColor: "#F5DEB3", toppingColor: "#FFB90F" },
  { id: 26, name: "Peach Perfection", bodyColor: "#FFDAB9", frostingColor: "#FFEBCD", toppingColor: "#FF7F50" },
  { id: 27, name: "Apricot Affair", bodyColor: "#FBCEB1", frostingColor: "#FAEBD7", toppingColor: "#ED9121" },
  { id: 28, name: "Tangerine Twist", bodyColor: "#F28500", frostingColor: "#FFE4B5", toppingColor: "#FF6347" },
  { id: 29, name: "Golden Honey", bodyColor: "#FFD700", frostingColor: "#FFFACD", toppingColor: "#DAA520" },
  { id: 30, name: "Sunshine Shimmer", bodyColor: "#FFD300", frostingColor: "#FFFAF0", toppingColor: "#FFA500" },

  // Green cakes (31-37)
  { id: 31, name: "Matcha Magic", bodyColor: "#88D66C", frostingColor: "#F0FFF0", toppingColor: "#228B22" },
  { id: 32, name: "Mint Chip", bodyColor: "#98FF98", frostingColor: "#FFFFFF", toppingColor: "#3EB489" },
  { id: 33, name: "Pistachio Pow", bodyColor: "#93C572", frostingColor: "#FAFAD2", toppingColor: "#6B8E23" },
  { id: 34, name: "Lime Lime", bodyColor: "#32CD32", frostingColor: "#F0FFF0", toppingColor: "#00FF00" },
  { id: 35, name: "Kiwi Kiss", bodyColor: "#8FBC8F", frostingColor: "#FFEBCD", toppingColor: "#9ACD32" },
  { id: 36, name: "Avocado Awesome", bodyColor: "#568203", frostingColor: "#F5F5DC", toppingColor: "#6B8E23" },
  { id: 37, name: "Emerald Envy", bodyColor: "#50C878", frostingColor: "#FFFFFF", toppingColor: "#00A86B" },

  // Brown/Chocolate cakes (38-45)
  { id: 38, name: "Chocolate Thunder", bodyColor: "#7B3F00", frostingColor: "#D2691E", toppingColor: "#3B2F2F" },
  { id: 39, name: "Mocha Madness", bodyColor: "#6F4E37", frostingColor: "#F5DEB3", toppingColor: "#4E342E" },
  { id: 40, name: "Caramel Cascade", bodyColor: "#D4A574", frostingColor: "#FAEBD7", toppingColor: "#C68E17" },
  { id: 41, name: "Coffee Cake Craze", bodyColor: "#6F4E37", frostingColor: "#FFE4C4", toppingColor: "#3E2723" },
  { id: 42, name: "Hazelnut Heaven", bodyColor: "#8B7355", frostingColor: "#FAEBD7", toppingColor: "#654321" },
  { id: 43, name: "Walnut Whirl", bodyColor: "#773F1A", frostingColor: "#DEB887", toppingColor: "#3E2723" },
  { id: 44, name: "Cocoa Crunch", bodyColor: "#D2691E", frostingColor: "#FFE4C4", toppingColor: "#A0522D" },
  { id: 45, name: "Tiramisu Twist", bodyColor: "#C19A6B", frostingColor: "#F5F5DC", toppingColor: "#8B4513" },

  // Special/Multi-color cakes (46-55)
  { id: 46, name: "Rainbow Rocket", bodyColor: "#FF6B9D", frostingColor: "#89CFF0", toppingColor: "#FFD700" },
  { id: 47, name: "Funfetti Frenzy", bodyColor: "#FAEBD7", frostingColor: "#FFFFFF", toppingColor: "#FF1493" },
  { id: 48, name: "Unicorn Dream", bodyColor: "#E0BBE4", frostingColor: "#FFB6C1", toppingColor: "#9370DB" },
  { id: 49, name: "Galaxy Glaze", bodyColor: "#191970", frostingColor: "#E6E6FA", toppingColor: "#FF1493" },
  { id: 50, name: "Confetti Celebration", bodyColor: "#FFFFE0", frostingColor: "#FFFFFF", toppingColor: "#FF6347" },
  { id: 51, name: "Ice Cream Sundae", bodyColor: "#F5DEB3", frostingColor: "#FFE4E1", toppingColor: "#DC143C" },
  { id: 52, name: "S'mores Surprise", bodyColor: "#D2691E", frostingColor: "#F5F5F5", toppingColor: "#3E2723" },
  { id: 53, name: "Birthday Blast", bodyColor: "#FFD700", frostingColor: "#FFFFFF", toppingColor: "#FF1493" },
  { id: 54, name: "Neapolitan", bodyColor: "#8B4513", frostingColor: "#FFB6C1", toppingColor: "#FFFACD" },
  { id: 55, name: "Wedding White", bodyColor: "#FFFFFF", frostingColor: "#FFFAF0", toppingColor: "#FFD700" }
];

// Generate medium-detail kawaii SVG for a cake
function generateCakeSVG(cake) {
  return `
    <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" class="cake-svg">
      <!-- Shadow -->
      <ellipse cx="50" cy="115" rx="45" ry="8" fill="rgba(0,0,0,0.1)"/>

      <!-- Cake body -->
      <ellipse cx="50" cy="60" rx="40" ry="35" fill="${cake.bodyColor}" stroke="#333" stroke-width="1.5"/>

      <!-- Frosting layer with wavy top -->
      <path d="M 10,45 Q 20,35 30,40 T 50,40 T 70,40 T 90,45 L 90,55 Q 70,60 50,55 T 10,55 Z"
            fill="${cake.frostingColor}" stroke="#333" stroke-width="1"/>

      <!-- Kawaii face -->
      <!-- Left eye -->
      <circle cx="35" cy="55" r="3.5" fill="#000"/>
      <circle cx="36" cy="54" r="1" fill="#FFF"/> <!-- eye shine -->

      <!-- Right eye -->
      <circle cx="65" cy="55" r="3.5" fill="#000"/>
      <circle cx="66" cy="54" r="1" fill="#FFF"/> <!-- eye shine -->

      <!-- Blushing cheeks -->
      <ellipse cx="25" cy="60" rx="5" ry="3" fill="#FFB6C1" opacity="0.5"/>
      <ellipse cx="75" cy="60" rx="5" ry="3" fill="#FFB6C1" opacity="0.5"/>

      <!-- Happy smile -->
      <path d="M 35,70 Q 50,78 65,70" stroke="#000" fill="none" stroke-width="2" stroke-linecap="round"/>

      <!-- Cherry/topping on top -->
      <circle cx="50" cy="28" r="9" fill="${cake.toppingColor}" stroke="#333" stroke-width="1"/>
      <ellipse cx="52" cy="26" rx="3" ry="2" fill="rgba(255,255,255,0.4)"/> <!-- shine on topping -->

      <!-- Stem for cherry -->
      <path d="M 50,28 Q 48,20 46,15" stroke="#228B22" stroke-width="2" fill="none"/>

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
