/**
 * Room Types and Photo Guidance Configuration
 */

export const ROOM_TYPES = {
  bedroom: {
    name: 'Bedroom',
    icon: '🛏️',
    photoGuidance: [
      {
        label: 'wide_shot',
        title: 'Wide Shot',
        description: 'Stand in the doorway and capture the entire room',
        icon: '📐'
      },
      {
        label: 'bed_area',
        title: 'Bed Area',
        description: 'Focus on the bed and surrounding furniture',
        icon: '🛏️'
      },
      {
        label: 'storage_overview',
        title: 'Storage Overview',
        description: 'Capture closets, dressers, and storage areas',
        icon: '🗄️'
      },
      {
        label: 'details_left',
        title: 'Left Side Details',
        description: 'Focus on the left side of the room',
        icon: '⬅️'
      },
      {
        label: 'details_right',
        title: 'Right Side Details',
        description: 'Focus on the right side of the room',
        icon: '➡️'
      },
      {
        label: 'ceiling_lighting',
        title: 'Ceiling & Lighting',
        description: 'Capture overhead view and lighting fixtures',
        icon: '💡'
      }
    ]
  },
  kitchen: {
    name: 'Kitchen',
    icon: '🍳',
    photoGuidance: [
      {
        label: 'wide_shot',
        title: 'Wide Shot',
        description: 'Capture the entire kitchen layout',
        icon: '📐'
      },
      {
        label: 'counters_cabinets',
        title: 'Counters & Cabinets',
        description: 'Focus on counter space and upper cabinets',
        icon: '🗄️'
      },
      {
        label: 'appliances',
        title: 'Appliances',
        description: 'Capture stove, fridge, and major appliances',
        icon: '🔌'
      },
      {
        label: 'storage_pantry',
        title: 'Storage & Pantry',
        description: 'Show pantry and storage areas',
        icon: '📦'
      },
      {
        label: 'sink_area',
        title: 'Sink Area',
        description: 'Focus on sink and surrounding workspace',
        icon: '🚰'
      },
      {
        label: 'dining_area',
        title: 'Dining Area',
        description: 'Capture eating space if in kitchen',
        icon: '🪑'
      }
    ]
  },
  living_room: {
    name: 'Living Room',
    icon: '🛋️',
    photoGuidance: [
      {
        label: 'wide_shot',
        title: 'Wide Shot',
        description: 'Capture the full living space',
        icon: '📐'
      },
      {
        label: 'seating_area',
        title: 'Seating Area',
        description: 'Focus on couch, chairs, and coffee table',
        icon: '🛋️'
      },
      {
        label: 'entertainment_center',
        title: 'Entertainment Center',
        description: 'Capture TV area and media storage',
        icon: '📺'
      },
      {
        label: 'storage_shelving',
        title: 'Storage & Shelving',
        description: 'Show bookcases and storage units',
        icon: '📚'
      },
      {
        label: 'decor_details',
        title: 'Decor Details',
        description: 'Capture artwork and decorative elements',
        icon: '🖼️'
      },
      {
        label: 'windows_lighting',
        title: 'Windows & Lighting',
        description: 'Show natural light sources and lamps',
        icon: '☀️'
      }
    ]
  }
};

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