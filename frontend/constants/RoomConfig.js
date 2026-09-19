/**
 * Room Types and Photo Guidance Configuration
 */

export const ROOM_TYPES = {
  bedroom: {
    name: 'Bedroom',
    icon: 'bedroom',
    photoGuidance: [
      {
        label: 'wide_shot',
        title: 'Wide Shot',
        description: 'Stand in the doorway and capture the entire room in one general shot.',
        icon: '📐'
      },
      {
        label: 'bed_area',
        title: 'Bed Area',
        description: 'Focus on the bed and surrounding furniture. Include a wide shot of the area plus specific close-ups of any clutter, if applicable.',
        icon: '🛏️'
      },
      {
        label: 'storage_overview',
        title: 'Storage Overview',
        description: 'Capture closets, dressers, and storage areas. Include a wide shot plus specific close-ups of crowded shelves or drawers, if applicable.',
        icon: '🗄️'
      },
      {
        label: 'details_left',
        title: 'Left Side Details',
        description: 'Focus on the left side of the room. Include a wide shot plus specific close-ups of anything that needs attention, if applicable.',
        icon: '⬅️'
      },
      {
        label: 'details_right',
        title: 'Right Side Details',
        description: 'Focus on the right side of the room. Include a wide shot plus specific close-ups of anything that needs attention, if applicable.',
        icon: '➡️'
      }
    ]
  },
  kitchen: {
    name: 'Kitchen',
    icon: 'kitchen',
    photoGuidance: [
      {
        label: 'wide_shot',
        title: 'Wide Shot',
        description: 'Capture the entire kitchen layout in one general shot.',
        icon: '📐'
      },
      {
        label: 'counters_cabinets',
        title: 'Counters & Cabinets',
        description: 'Focus on counter space and upper cabinets. Include a wide shot plus specific close-ups of cluttered counters or open cabinets, if applicable.',
        icon: '🗄️'
      },
      {
        label: 'appliances',
        title: 'Appliances',
        description: 'Capture stove, fridge, and major appliances. Include a wide shot plus specific close-ups of any appliance you want organized around, if applicable.',
        icon: '🔌'
      },
      {
        label: 'storage_pantry',
        title: 'Storage & Pantry',
        description: 'Show pantry and storage areas. Include a wide shot plus specific close-ups of crowded shelves, if applicable.',
        icon: '📦'
      },
      {
        label: 'sink_area',
        title: 'Sink Area',
        description: 'Focus on sink and surrounding workspace.',
        icon: '🚰'
      },
      {
        label: 'dining_area',
        title: 'Dining Area',
        description: 'Capture eating space if in kitchen. Include a wide shot plus specific close-ups, if applicable.',
        icon: '🪑'
      }
    ]
  },
  living_room: {
    name: 'Living Room',
    icon: 'living_room',
    photoGuidance: [
      {
        label: 'wide_shot',
        title: 'Wide Shot',
        description: 'Capture the full living space in one general shot.',
        icon: '📐'
      },
      {
        label: 'seating_area',
        title: 'Seating Area',
        description: 'Focus on couch, chairs, and coffee table. Include a wide shot of the seating area plus specific close-ups of any clutter, if applicable.',
        icon: '🛋️'
      },
      {
        label: 'entertainment_center',
        title: 'Entertainment Center',
        description: 'Capture TV area and media storage. Include a wide shot plus specific close-ups of cables, media, or clutter, if applicable.',
        icon: '📺'
      },
      {
        label: 'storage_shelving',
        title: 'Storage & Shelving',
        description: 'Show bookcases and storage units. Include a wide shot plus specific close-ups of crowded shelves, if applicable.',
        icon: '📚'
      },
      {
        label: 'decor_details',
        title: 'Decor Details',
        description: 'Capture artwork and decorative elements.',
        icon: '🖼️'
      }
    ]
  },
  bathroom: {
    name: 'Bathroom',
    icon: 'bathroom',
    photoGuidance: [
      {
        label: 'wide_shot',
        title: 'Wide Shot',
        description: 'Stand in the doorway and capture the entire bathroom in one general shot.',
        icon: '📐'
      },
      {
        label: 'vanity_storage',
        title: 'Vanity & Storage',
        description: 'Focus on the vanity, medicine cabinet, and any drawers. Include a wide shot plus specific close-ups of crowded drawers or countertops, if applicable.',
        icon: '🗄️'
      },
      {
        label: 'under_sink',
        title: 'Under the Sink',
        description: 'Open the cabinet under the sink and capture what is inside. Include a wide shot plus specific close-ups of crowded areas, if applicable.',
        icon: '🚰'
      },
      {
        label: 'shower_tub',
        title: 'Shower / Tub Area',
        description: 'Capture the shower or tub, including any shelves or caddies.',
        icon: '🚿'
      },
      {
        label: 'linen_storage',
        title: 'Linen & Towel Storage',
        description: 'Show any closet or shelving used for towels and linens. Include a wide shot plus specific close-ups of crowded shelves, if applicable.',
        icon: '🧺'
      }
    ]
  },
  dining_room: {
    name: 'Dining Room',
    icon: 'dining_room',
    photoGuidance: [
      {
        label: 'wide_shot',
        title: 'Wide Shot',
        description: 'Capture the entire dining space in one general shot.',
        icon: '📐'
      },
      {
        label: 'table_area',
        title: 'Table Area',
        description: 'Focus on the table and any items on or around it. Include a wide shot plus specific close-ups of clutter, if applicable.',
        icon: '🍽️'
      },
      {
        label: 'storage_hutch',
        title: 'Storage / Hutch',
        description: 'Capture any hutch, buffet, or storage furniture. Include a wide shot plus specific close-ups of crowded shelves or drawers, if applicable.',
        icon: '🗄️'
      }
    ]
  },
  office: {
    name: 'Home Office',
    icon: 'office',
    photoGuidance: [
      {
        label: 'wide_shot',
        title: 'Wide Shot',
        description: 'Capture the entire office space in one general shot.',
        icon: '📐'
      },
      {
        label: 'desk_area',
        title: 'Desk Area',
        description: 'Focus on the desk and everything on it. Include a wide shot plus specific close-ups of cluttered spots, if applicable.',
        icon: '🖥️'
      },
      {
        label: 'storage_shelving',
        title: 'Storage & Shelving',
        description: 'Capture shelves, filing cabinets, or storage units. Include a wide shot plus specific close-ups of crowded shelves or drawers, if applicable.',
        icon: '📚'
      },
      {
        label: 'cables_supplies',
        title: 'Cables & Supplies',
        description: 'Show cable clutter, cords, or loose supplies that need organizing, if applicable.',
        icon: '🔌'
      }
    ]
  },
  baby_room: {
    name: 'Baby Room',
    icon: 'baby_room',
    photoGuidance: [
      {
        label: 'wide_shot',
        title: 'Wide Shot',
        description: 'Stand in the doorway and capture the entire room in one general shot.',
        icon: '📐'
      },
      {
        label: 'crib_area',
        title: 'Crib Area',
        description: 'Focus on the crib and surrounding furniture. Include a wide shot plus specific close-ups of any clutter, if applicable.',
        icon: '🍼'
      },
      {
        label: 'storage_overview',
        title: 'Storage Overview',
        description: 'Capture closets, dressers, and storage bins. Include a wide shot plus specific close-ups of crowded shelves or drawers, if applicable.',
        icon: '🗄️'
      },
      {
        label: 'changing_station',
        title: 'Changing Station',
        description: 'Show the changing table and its supplies, if applicable. Include a wide shot plus specific close-ups of clutter.',
        icon: '🧴'
      }
    ]
  },
  wardrobe: {
    name: 'Wardrobe / Closet',
    icon: 'wardrobe',
    photoGuidance: [
      {
        label: 'wide_shot',
        title: 'Wide Shot',
        description: 'Open the doors and capture the entire wardrobe in one general shot.',
        icon: '📐'
      },
      {
        label: 'hanging_section',
        title: 'Hanging Section',
        description: 'Focus on hanging clothes. Include a wide shot plus specific close-ups of crowded rods, if applicable.',
        icon: '👔'
      },
      {
        label: 'shelves_drawers',
        title: 'Shelves & Drawers',
        description: 'Capture folded items on shelves or in drawers. Include a wide shot plus specific close-ups of crowded areas, if applicable.',
        icon: '🗄️'
      },
      {
        label: 'shoes_accessories',
        title: 'Shoes & Accessories',
        description: 'Show shoes, bags, and accessory storage. Include a wide shot plus specific close-ups of clutter, if applicable.',
        icon: '👜'
      }
    ]
  },
  garage: {
    name: 'Garage',
    icon: 'garage',
    photoGuidance: [
      {
        label: 'wide_shot',
        title: 'Wide Shot',
        description: 'Stand in the doorway and capture the entire garage in one general shot.',
        icon: '📐'
      },
      {
        label: 'wall_storage',
        title: 'Wall Storage & Shelving',
        description: 'Focus on wall-mounted shelving, pegboards, or cabinets. Include a wide shot plus specific close-ups of crowded areas, if applicable.',
        icon: '🗄️'
      },
      {
        label: 'tools_equipment',
        title: 'Tools & Equipment',
        description: 'Capture tools, sporting goods, or other equipment stored here. Include a wide shot plus specific close-ups of clutter, if applicable.',
        icon: '🔧'
      },
      {
        label: 'overhead_storage',
        title: 'Overhead Storage',
        description: 'Show any overhead racks or ceiling storage, if applicable.',
        icon: '📦'
      }
    ]
  },
  storage_room: {
    name: 'Storage Room',
    icon: 'storage_room',
    photoGuidance: [
      {
        label: 'wide_shot',
        title: 'Wide Shot',
        description: 'Capture the entire storage space in one general shot.',
        icon: '📐'
      },
      {
        label: 'shelving_bins',
        title: 'Shelving & Bins',
        description: 'Focus on shelving units and storage bins. Include a wide shot plus specific close-ups of crowded shelves, if applicable.',
        icon: '🗄️'
      },
      {
        label: 'seasonal_items',
        title: 'Seasonal Items',
        description: 'Capture seasonal or rarely-used items stored here. Include a wide shot plus specific close-ups, if applicable.',
        icon: '📦'
      }
    ]
  }
};

// Generic guidance for a user-named custom room ("+ Create Your Own Room")
// — there's no fixed category list for an arbitrary space, so this covers
// the same shape (wide shot + a few flexible categories) every other room
// type uses, worded generically enough to fit any room.
export const DEFAULT_ROOM_PHOTO_GUIDANCE = [
  {
    label: 'wide_shot',
    title: 'Wide Shot',
    description: 'Stand in the doorway and capture the entire space in one general shot.',
    icon: '📐'
  },
  {
    label: 'main_area',
    title: 'Main Area',
    description: 'Focus on the main part of the space. Include a wide shot plus specific close-ups of anything that needs attention, if applicable.',
    icon: '🗄️'
  },
  {
    label: 'storage_overview',
    title: 'Storage Overview',
    description: 'Capture any shelves, cabinets, or storage areas. Include a wide shot plus specific close-ups of crowded storage, if applicable.',
    icon: '📦'
  },
  {
    label: 'details',
    title: 'Additional Details',
    description: 'Any other areas or details worth capturing, if applicable.',
    icon: '🔍'
  }
];

/**
 * Builds a ROOM_TYPES-shaped config object for a user-named custom room,
 * so every screen that reads roomConfig.icon/name/photoGuidance works the
 * same way for a custom room as it does for a built-in one.
 * @param {string} name - the user's own name for their room
 */
export const buildCustomRoomConfig = (name) => ({
  name: name.trim() || 'Custom Room',
  icon: 'custom',
  photoGuidance: DEFAULT_ROOM_PHOTO_GUIDANCE,
});

export const AREA_PHOTO_GUIDANCE = {
  closet: [
    { label: 'open_view', title: 'Open View', description: 'Full view with doors open', icon: '🚪' },
    { label: 'hanging_clothes', title: 'Hanging Section', description: 'Focus on hanging clothes', icon: '👔' },
    { label: 'shelves_top', title: 'Top Shelves', description: 'Upper shelving area', icon: '📦' },
    { label: 'shelves_bottom', title: 'Bottom Section', description: 'Floor and lower shelves', icon: '👟' },
    { label: 'accessories', title: 'Accessories', description: 'Bags, shoes, accessories', icon: '👜' },
    { label: 'close_up', title: 'Problem Areas', description: 'Any cluttered spots', icon: '🔍' }
  ],
  dresser: [
    { label: 'exterior', title: 'Exterior', description: 'Closed dresser front view', icon: '🗄️' },
    { label: 'top_surface', title: 'Top Surface', description: 'Items on top', icon: '📱' },
    { label: 'drawer_1', title: 'Top Drawer', description: 'Contents of top drawer', icon: '📦' },
    { label: 'drawer_2', title: 'Middle Drawer', description: 'Contents of middle drawer', icon: '📦' },
    { label: 'drawer_3', title: 'Bottom Drawer', description: 'Contents of bottom drawer', icon: '📦' },
    { label: 'close_up', title: 'Detail Shot', description: 'Any problem areas', icon: '🔍' }
  ],
  cabinet: [
    { label: 'closed_view', title: 'Closed View', description: 'Cabinet with doors closed', icon: '🚪' },
    { label: 'open_overview', title: 'Open Overview', description: 'Full interior view', icon: '👀' },
    { label: 'top_shelf', title: 'Top Shelf', description: 'Upper shelf contents', icon: '⬆️' },
    { label: 'middle_shelf', title: 'Middle Shelf', description: 'Middle shelf contents', icon: '➡️' },
    { label: 'bottom_shelf', title: 'Bottom Shelf', description: 'Lower shelf contents', icon: '⬇️' },
    { label: 'detail_shot', title: 'Problem Areas', description: 'Cluttered or messy spots', icon: '🔍' }
  ],
  default: [
    { label: 'wide_view', title: 'Wide View', description: 'Overall view of the area', icon: '📐' },
    { label: 'left_angle', title: 'Left Angle', description: 'View from the left', icon: '⬅️' },
    { label: 'right_angle', title: 'Right Angle', description: 'View from the right', icon: '➡️' },
    { label: 'top_view', title: 'Top/Inside', description: 'Looking down or inside', icon: '⬇️' },
    { label: 'detail_1', title: 'Detail 1', description: 'First detail area', icon: '🔍' },
    { label: 'detail_2', title: 'Detail 2', description: 'Second detail area', icon: '🔍' }
  ]
};

// Add this at the end of RoomConfig.js

/**
 * Get photo guidance for a specific area
 * @param {string} areaName - Name of the area (e.g., 'closet', 'dresser')
 * @returns {Array} Array of photo guidance objects
 */
export const getAreaGuidance = (areaName) => {
  // Normalize the area name to lowercase and remove special characters
  const normalizedName = areaName.toLowerCase().trim();
  
  // Check if we have specific guidance for this area
  if (AREA_PHOTO_GUIDANCE[normalizedName]) {
    return AREA_PHOTO_GUIDANCE[normalizedName];
  }
  
  // Check for partial matches (e.g., "Kitchen Cabinet" -> "cabinet")
  const matchingKey = Object.keys(AREA_PHOTO_GUIDANCE).find(key => 
    normalizedName.includes(key) || key.includes(normalizedName)
  );
  
  if (matchingKey) {
    return AREA_PHOTO_GUIDANCE[matchingKey];
  }
  
  // Fall back to default guidance
  return AREA_PHOTO_GUIDANCE.default;
};