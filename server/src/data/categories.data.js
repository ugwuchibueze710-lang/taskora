// ============================================================================
// THE single source of truth for Taskora's service category catalog.
//
// This file is the ONLY place category names, groupings, descriptions, and
// search-alias keywords are defined. Everything else — the home page, the
// provider "what services do you offer?" setup step, the post-signup
// services manager, customer search, and the AI search assistant — reads
// categories from the database, and the database is populated FROM this
// file by `syncCategoryCatalog()` (server/src/services/category.service.js),
// which runs automatically once on server boot. Nothing hardcodes a
// duplicate category list anywhere else in the app.
//
// To add, rename, or retire a category: edit this file only, then redeploy.
// `image` is left null for now (real photography comes later) — the UI
// falls back to a neutral icon when it's missing, never a broken image.
//
// Editing an existing category's `id` after it has shipped will orphan any
// providers/search history already pointing at the old id — rename `name`
// instead of `id` once this is live.
// ============================================================================

export const CATEGORY_GROUPS = [
  { slug: 'home-services', name: 'Home Services' },
  { slug: 'yard-outdoor', name: 'Yard & Outdoor' },
  { slug: 'automotive', name: 'Automotive' },
  { slug: 'delivery-errands', name: 'Delivery & Errands' },
  { slug: 'personal-assistance', name: 'Personal Assistance' },
  { slug: 'technology', name: 'Technology' },
  { slug: 'beauty-personal-care', name: 'Beauty & Personal Care' },
  { slug: 'events', name: 'Events' },
  { slug: 'pets', name: 'Pet Services' },
  { slug: 'family', name: 'Child & Family Services' },
  { slug: 'senior-care', name: 'Elder & Assistance Services' },
  { slug: 'business', name: 'Business Services' },
  { slug: 'moving-transport', name: 'Moving & Transportation' },
  { slug: 'other', name: 'Other Services' },
];

// image intentionally omitted (defaults to null) on every entry below —
// see file header. Add `image: 'https://...'` per category once sourced.
export const CATEGORIES = [
  // ---- Home Services -------------------------------------------------
  cat('handyman', 'Handyman', 'home-services', 'General home repairs and small fix-it jobs.', ['handy man', 'odd jobs', 'general repairs', 'fix it']),
  cat('plumbing', 'Plumbing', 'home-services', 'Leaks, drains, fixtures, and water heater service.', ['plumber', 'leak repair', 'drain cleaning', 'pipe repair', 'water heater']),
  cat('electrician', 'Electrician', 'home-services', 'Wiring, outlets, panels, and lighting installation.', ['electrical', 'electrical repair', 'outlet installation', 'panel upgrade', 'wiring']),
  cat('hvac', 'HVAC', 'home-services', 'Heating, ventilation, and air conditioning service.', ['air conditioning', 'ac repair', 'furnace repair', 'heating repair', 'hvac repair']),
  cat('appliance-repair', 'Appliance Repair', 'home-services', 'Repair for major home appliances.', ['fridge repair', 'washer repair', 'dryer repair', 'dishwasher repair', 'oven repair']),
  cat('home-cleaning', 'House Cleaning', 'home-services', 'Standard residential cleaning.', ['house cleaner', 'maid service', 'cleaning service', 'home cleaner']),
  cat('deep-cleaning', 'Deep Cleaning', 'home-services', 'Intensive top-to-bottom cleaning.', ['deep clean', 'move-out cleaning', 'move-in cleaning', 'spring cleaning']),
  cat('carpet-cleaning', 'Carpet Cleaning', 'home-services', 'Carpet and rug steam or shampoo cleaning.', ['rug cleaning', 'carpet shampoo', 'steam cleaning']),
  cat('window-cleaning', 'Window Cleaning', 'home-services', 'Interior and exterior window washing.', ['window washing', 'glass cleaning']),
  cat('pressure-washing', 'Pressure Washing', 'home-services', 'Exterior surface and driveway pressure washing.', ['power washing', 'driveway cleaning', 'house washing']),
  cat('house-painting', 'House Painting', 'home-services', 'Full-house interior or exterior painting.', ['painter', 'painting service']),
  cat('interior-painting', 'Interior Painting', 'home-services', 'Painting for interior rooms and trim.', ['room painting', 'wall painting']),
  cat('exterior-painting', 'Exterior Painting', 'home-services', 'Painting for siding, trim, and exteriors.', ['exterior painter']),
  cat('drywall-repair', 'Drywall Repair', 'home-services', 'Patching holes, cracks, and drywall damage.', ['sheetrock repair', 'wall patch', 'hole repair']),
  cat('flooring', 'Flooring', 'home-services', 'Flooring installation and repair.', ['floor installation', 'hardwood flooring', 'laminate flooring']),
  cat('tile-installation', 'Tile Installation', 'home-services', 'Tile installation and repair.', ['tiling', 'backsplash installation']),
  cat('roofing', 'Roofing', 'home-services', 'Roof repair, replacement, and inspection.', ['roofer', 'roof repair', 'roof leak', 'shingle repair']),
  cat('gutter-cleaning', 'Gutter Cleaning', 'home-services', 'Gutter cleaning and minor repair.', ['gutter service', 'downspout cleaning']),
  cat('siding', 'Siding', 'home-services', 'Siding installation and repair.', ['vinyl siding', 'siding repair']),
  cat('door-installation', 'Door Installation', 'home-services', 'Interior and exterior door installation.', ['door repair', 'door replacement']),
  cat('window-installation', 'Window Installation', 'home-services', 'Window installation and replacement.', ['window replacement']),
  cat('locksmith', 'Locksmith', 'home-services', 'Lock repair, rekeying, and lockout service.', ['lock repair', 'key service', 'locked out', 'door lock', 'rekey', 'lockout']),
  cat('pest-control', 'Pest Control', 'home-services', 'Extermination and pest prevention.', ['exterminator', 'bug spray', 'termite control', 'rodent control']),
  cat('home-security', 'Home Security', 'home-services', 'Security system installation and setup.', ['alarm installation', 'security camera install']),
  cat('smart-home-installation', 'Smart Home Installation', 'home-services', 'Smart device and automation setup.', ['smart home setup', 'home automation']),
  cat('furniture-assembly', 'Furniture Assembly', 'home-services', 'Assembly for flat-pack and ready-to-assemble furniture.', ['ikea assembly', 'furniture building', 'bed frame assembly']),
  cat('tv-mounting', 'TV Mounting', 'home-services', 'Wall-mounting televisions and cable management.', ['tv installation', 'wall mount tv']),
  cat('home-organization', 'Home Organization', 'home-services', 'Decluttering and organizing living spaces.', ['organizer', 'closet organization', 'decluttering']),
  cat('junk-removal', 'Junk Removal', 'home-services', 'Hauling away unwanted items and debris.', ['hauling', 'trash removal', 'debris removal']),
  cat('moving', 'Moving', 'home-services', 'Local moving and furniture transport.', ['movers', 'moving help', 'local moving']),
  cat('packing-unpacking', 'Packing/Unpacking', 'home-services', 'Packing and unpacking help for a move.', ['packing service', 'unpacking help']),

  // ---- Yard & Outdoor --------------------------------------------------
  cat('lawn-mowing', 'Lawn Mowing', 'yard-outdoor', 'Regular lawn mowing service.', ['mow my lawn', 'grass cutting']),
  cat('lawn-care', 'Lawn Care', 'yard-outdoor', 'Fertilizing, weed control, and lawn treatment.', ['fertilizing', 'weed control', 'lawn treatment']),
  cat('landscaping', 'Landscaping', 'yard-outdoor', 'Landscape design and installation.', ['landscaper', 'yard design']),
  cat('gardening', 'Gardening', 'yard-outdoor', 'Garden planting and maintenance.', ['gardener', 'garden maintenance']),
  cat('tree-trimming', 'Tree Trimming', 'yard-outdoor', 'Trimming and pruning trees.', ['tree pruning', 'tree service']),
  cat('tree-removal', 'Tree Removal', 'yard-outdoor', 'Removing trees and stumps.', ['stump removal', 'tree cutting']),
  cat('leaf-removal', 'Leaf Removal', 'yard-outdoor', 'Seasonal leaf clean-up and hauling.', ['leaf raking', 'leaf cleanup']),
  cat('snow-removal', 'Snow Removal', 'yard-outdoor', 'Snow plowing and shoveling.', ['snow plowing', 'shoveling']),
  cat('yard-cleanup', 'Yard Cleanup', 'yard-outdoor', 'General yard and outdoor cleanup.', ['yard work', 'outdoor cleanup']),
  cat('fence-installation', 'Fence Installation', 'yard-outdoor', 'Installing new fencing.', ['fence builder']),
  cat('fence-repair', 'Fence Repair', 'yard-outdoor', 'Repairing existing fences.', ['fence fix']),
  cat('deck-repair', 'Deck Repair', 'yard-outdoor', 'Repairing decks and porches.', ['deck fix', 'porch repair']),
  cat('deck-installation', 'Deck Installation', 'yard-outdoor', 'Building new decks.', ['deck builder', 'deck construction']),
  cat('outdoor-lighting', 'Outdoor Lighting', 'yard-outdoor', 'Installing landscape and outdoor lighting.', ['landscape lighting']),
  cat('pool-cleaning', 'Pool Cleaning', 'yard-outdoor', 'Routine pool cleaning.', ['pool service']),
  cat('pool-maintenance', 'Pool Maintenance', 'yard-outdoor', 'Ongoing pool equipment maintenance.', ['pool repair', 'pool chemicals']),

  // ---- Automotive -------------------------------------------------------
  cat('mobile-mechanic', 'Mobile Mechanic', 'automotive', 'Auto repair that comes to you.', ['mobile auto repair']),
  cat('auto-repair', 'Auto Repair', 'automotive', 'General vehicle repair.', ['car repair', 'mechanic']),
  cat('oil-change', 'Oil Change', 'automotive', 'Mobile or shop oil changes.', ['oil change service']),
  cat('brake-repair', 'Brake Repair', 'automotive', 'Brake pad, rotor, and line repair.', ['brake service', 'brake pads']),
  cat('tire-service', 'Tire Service', 'automotive', 'Tire repair and rotation.', ['flat tire repair', 'tire rotation']),
  cat('tire-installation', 'Tire Installation', 'automotive', 'Mounting and balancing new tires.', ['tire mounting', 'new tires']),
  cat('car-detailing', 'Car Detailing', 'automotive', 'Interior and exterior vehicle detailing.', ['auto detailing', 'car wash detail']),
  cat('mobile-car-wash', 'Mobile Car Wash', 'automotive', 'Car washing that comes to you.', ['car wash']),
  cat('auto-locksmith', 'Auto Locksmith', 'automotive', 'Car key replacement and lockout service.', ['car locked out', 'car key replacement']),
  cat('battery-jump-start', 'Battery Jump Start', 'automotive', 'Dead battery jump-start service.', ['dead battery', 'jump start']),
  cat('roadside-assistance', 'Roadside Assistance', 'automotive', 'On-the-spot roadside help.', ['tow truck', 'roadside help']),
  cat('vehicle-inspection', 'Vehicle Inspection', 'automotive', 'Pre-purchase or safety inspections.', ['car inspection']),
  cat('car-delivery', 'Car Delivery', 'automotive', 'Vehicle transport and delivery.', ['vehicle transport']),
  cat('motorcycle-repair', 'Motorcycle Repair', 'automotive', 'Motorcycle service and repair.', ['motorcycle mechanic']),

  // ---- Delivery & Errands -------------------------------------------
  cat('grocery-pickup', 'Grocery Pickup', 'delivery-errands', 'Someone picks up your groceries for you.', ['grocery shopping', 'grocery run']),
  cat('grocery-delivery', 'Grocery Delivery', 'delivery-errands', 'Groceries picked up and delivered.', ['grocery delivery service']),
  cat('food-delivery', 'Food Delivery', 'delivery-errands', 'Restaurant food pickup and delivery.', ['food runner']),
  cat('package-pickup', 'Package Pickup', 'delivery-errands', 'Picking up packages on your behalf.', []),
  cat('package-delivery', 'Package Delivery', 'delivery-errands', 'Delivering packages locally.', ['parcel delivery']),
  cat('courier', 'Courier', 'delivery-errands', 'General local courier service.', ['courier service']),
  cat('pharmacy-pickup', 'Pharmacy Pickup', 'delivery-errands', 'Picking up prescriptions.', ['prescription pickup']),
  cat('errand-runner', 'Errand Runner', 'delivery-errands', 'General errands run on your behalf.', ['errand service', 'run errands']),
  cat('personal-shopper', 'Personal Shopper', 'delivery-errands', 'Shopping done for you.', ['shopping help']),
  cat('furniture-delivery', 'Furniture Delivery', 'delivery-errands', 'Delivering furniture purchases.', []),
  cat('moving-help', 'Moving Help', 'delivery-errands', 'Extra hands for moving day.', ['moving labor']),
  cat('same-day-delivery', 'Same-Day Delivery', 'delivery-errands', 'Fast local same-day delivery.', []),
  cat('local-delivery', 'Local Delivery', 'delivery-errands', 'General local delivery service.', []),

  // ---- Personal Assistance -------------------------------------------
  cat('personal-assistant', 'Personal Assistant', 'personal-assistance', 'In-person help with day-to-day tasks.', ['personal aide']),
  cat('virtual-assistant', 'Virtual Assistant', 'personal-assistance', 'Remote administrative and task support.', ['remote assistant']),
  cat('errand-assistant', 'Errand Assistant', 'personal-assistance', 'Ongoing help running errands.', []),
  cat('event-assistant', 'Event Assistant', 'personal-assistance', 'Extra hands for planning or running events.', []),
  cat('shopping-assistant', 'Shopping Assistant', 'personal-assistance', 'Help with shopping trips or lists.', []),
  cat('household-assistant', 'Household Assistant', 'personal-assistance', 'General household help.', []),
  cat('senior-errand-assistance', 'Senior Errand Assistance', 'personal-assistance', 'Errand help tailored for seniors.', []),
  cat('administrative-assistance', 'Administrative Assistance', 'personal-assistance', 'General admin support.', ['admin help']),
  cat('scheduling-assistant', 'Scheduling Assistant', 'personal-assistance', 'Calendar and appointment scheduling help.', []),

  // ---- Technology -------------------------------------------------------
  cat('computer-repair', 'Computer Repair', 'technology', 'Diagnosing and repairing computers.', ['pc repair', 'laptop repair']),
  cat('phone-repair', 'Phone Repair', 'technology', 'Cell phone screen and hardware repair.', ['cell phone repair', 'screen repair']),
  cat('tablet-repair', 'Tablet Repair', 'technology', 'Tablet screen and hardware repair.', ['ipad repair']),
  cat('wifi-setup', 'Wi-Fi Setup', 'technology', 'Home network and Wi-Fi setup.', ['wifi installation', 'router setup']),
  cat('network-setup', 'Network Setup', 'technology', 'Home or small office networking.', ['network installation']),
  cat('smart-home-setup', 'Smart Home Setup', 'technology', 'Configuring smart home devices.', ['smart device setup']),
  cat('printer-setup', 'Printer Setup', 'technology', 'Printer installation and troubleshooting.', ['printer installation']),
  cat('tv-entertainment-setup', 'TV/Entertainment Setup', 'technology', 'Home theater and entertainment system setup.', ['home theater setup']),
  cat('data-transfer', 'Data Transfer', 'technology', 'Moving files/data between devices.', ['file transfer']),
  cat('tech-support', 'Tech Support', 'technology', 'General technical troubleshooting.', ['computer help']),
  cat('software-installation', 'Software Installation', 'technology', 'Installing and configuring software.', []),
  cat('device-setup', 'Device Setup', 'technology', 'General new-device setup help.', ['new device setup']),

  // ---- Beauty & Personal Care -----------------------------------------
  cat('haircut', 'Haircut', 'beauty-personal-care', 'Haircuts at home or on location.', ['hair cut']),
  cat('hairstylist', 'Hairstylist', 'beauty-personal-care', 'Hair styling services.', ['hair stylist', 'hairdresser']),
  cat('barber', 'Barber', 'beauty-personal-care', 'Barber services.', []),
  cat('makeup-artist', 'Makeup Artist', 'beauty-personal-care', 'Makeup application for events or photos.', ['makeup']),
  cat('nail-technician', 'Nail Technician', 'beauty-personal-care', 'Manicures and pedicures.', ['manicure', 'pedicure', 'nail tech']),
  cat('eyelash-technician', 'Eyelash Technician', 'beauty-personal-care', 'Eyelash extensions and services.', ['lash tech', 'eyelash extensions']),
  cat('massage', 'Massage', 'beauty-personal-care', 'Therapeutic and relaxation massage.', ['massage therapist']),
  cat('personal-care-services', 'Personal Care Services', 'beauty-personal-care', 'General personal care assistance.', []),

  // ---- Events -------------------------------------------------------
  cat('event-planning', 'Event Planning', 'events', 'Planning and coordinating events.', ['event planner']),
  cat('wedding-planning', 'Wedding Planning', 'events', 'Wedding planning and coordination.', ['wedding planner']),
  cat('party-planning', 'Party Planning', 'events', 'Planning parties and celebrations.', ['party planner']),
  cat('dj', 'DJ', 'events', 'DJ services for events.', ['disc jockey']),
  cat('photographer', 'Photographer', 'events', 'Event and portrait photography.', ['photography']),
  cat('videographer', 'Videographer', 'events', 'Event videography.', ['videography']),
  cat('photo-booth', 'Photo Booth', 'events', 'Photo booth rental for events.', []),
  cat('catering', 'Catering', 'events', 'Food catering for events.', ['caterer']),
  cat('bartender', 'Bartender', 'events', 'Bartending for events.', ['bartending service']),
  cat('event-decorating', 'Event Decorating', 'events', 'Decorating for events.', ['event decor']),
  cat('balloon-decorating', 'Balloon Decorating', 'events', 'Balloon arches and decor.', ['balloon arch']),
  cat('florist', 'Florist', 'events', 'Floral arrangements for events.', ['flowers', 'floral design']),
  cat('party-setup', 'Party Setup', 'events', 'Setting up for a party or event.', []),
  cat('party-cleanup', 'Party Cleanup', 'events', 'Cleanup after a party or event.', []),

  // ---- Pet Services -------------------------------------------------
  cat('dog-walking', 'Dog Walking', 'pets', 'Regular dog walking service.', ['dog walker']),
  cat('pet-sitting', 'Pet Sitting', 'pets', 'Watching pets while you’re away.', ['pet sitter']),
  cat('dog-sitting', 'Dog Sitting', 'pets', 'Dog sitting and boarding.', []),
  cat('cat-sitting', 'Cat Sitting', 'pets', 'Cat sitting and drop-in visits.', []),
  cat('pet-grooming', 'Pet Grooming', 'pets', 'Grooming for pets.', ['groomer']),
  cat('dog-grooming', 'Dog Grooming', 'pets', 'Grooming specifically for dogs.', []),
  cat('pet-transportation', 'Pet Transportation', 'pets', 'Transporting pets to appointments.', []),
  cat('pet-waste-removal', 'Pet Waste Removal', 'pets', 'Yard waste cleanup for pet owners.', ['poop scooping']),
  cat('pet-training', 'Pet Training', 'pets', 'Obedience and behavior training.', ['dog training']),

  // ---- Child & Family Services ----------------------------------------
  cat('babysitting', 'Babysitting', 'family', 'In-home babysitting.', ['babysitter']),
  cat('childcare', 'Childcare', 'family', 'Regular childcare services.', ['child care']),
  cat('tutoring', 'Tutoring', 'family', 'Academic tutoring.', ['tutor']),
  cat('homework-help', 'Homework Help', 'family', 'Help with schoolwork.', []),
  cat('school-pickup', 'School Pickup', 'family', 'Picking kids up from school.', []),
  cat('kids-activities', 'Kids Activities', 'family', 'Organizing activities for children.', []),
  cat('family-assistance', 'Family Assistance', 'family', 'General family support services.', []),

  // ---- Elder & Assistance Services -------------------------------------
  cat('companion-services', 'Companion Services', 'senior-care', 'Companionship and check-in visits.', ['companion care']),
  cat('elder-errand-assistance', 'Errand Assistance', 'senior-care', 'Errand help for elderly clients.', []),
  cat('grocery-assistance', 'Grocery Assistance', 'senior-care', 'Help with grocery shopping.', []),
  cat('transportation-assistance', 'Transportation Assistance', 'senior-care', 'Rides to appointments and errands.', ['ride assistance']),
  cat('household-assistance', 'Household Assistance', 'senior-care', 'Help with household tasks.', []),
  cat('appointment-assistance', 'Appointment Assistance', 'senior-care', 'Help getting to and from appointments.', []),

  // ---- Business Services ---------------------------------------------
  cat('office-cleaning', 'Office Cleaning', 'business', 'Cleaning for office spaces.', []),
  cat('commercial-cleaning', 'Commercial Cleaning', 'business', 'Cleaning for commercial properties.', []),
  cat('data-entry', 'Data Entry', 'business', 'Data entry support.', []),
  cat('bookkeeping', 'Bookkeeping', 'business', 'Bookkeeping and basic accounting support.', ['bookkeeper']),
  cat('graphic-design', 'Graphic Design', 'business', 'Graphic design services.', ['graphic designer']),
  cat('business-photography', 'Photography', 'business', 'Business and product photography.', []),
  cat('business-videography', 'Videography', 'business', 'Business and promotional video.', []),
  cat('social-media-assistance', 'Social Media Assistance', 'business', 'Help managing social media.', ['social media management']),
  cat('marketing-assistance', 'Marketing Assistance', 'business', 'General marketing support.', []),
  cat('website-assistance', 'Website Assistance', 'business', 'Help building or maintaining a website.', ['web design help']),
  cat('computer-support', 'Computer Support', 'business', 'IT support for small businesses.', ['it support']),

  // ---- Moving & Transportation ------------------------------------------
  cat('moving-labor', 'Moving Labor', 'moving-transport', 'Labor-only help for a move.', []),
  cat('furniture-moving', 'Furniture Moving', 'moving-transport', 'Moving furniture within or between homes.', []),
  cat('loading-unloading', 'Loading/Unloading', 'moving-transport', 'Loading and unloading moving trucks.', []),
  cat('packing', 'Packing', 'moving-transport', 'Packing items for a move.', []),
  cat('unpacking', 'Unpacking', 'moving-transport', 'Unpacking after a move.', []),
  cat('truck-loading', 'Truck Loading', 'moving-transport', 'Loading rental trucks.', []),
  cat('trailer-loading', 'Trailer Loading', 'moving-transport', 'Loading trailers.', []),
  cat('local-transportation', 'Local Transportation', 'moving-transport', 'Local transportation services.', []),
  cat('vehicle-transport', 'Vehicle Transport', 'moving-transport', 'Transporting vehicles.', []),

  // ---- Other / Miscellaneous --------------------------------------------
  cat('sewing', 'Sewing', 'other', 'Sewing and mending.', []),
  cat('alterations', 'Alterations', 'other', 'Clothing alterations.', ['tailoring']),
  cat('furniture-repair', 'Furniture Repair', 'other', 'Repairing furniture.', []),
  cat('furniture-restoration', 'Furniture Restoration', 'other', 'Restoring older furniture.', ['furniture refinishing']),
  cat('custom-woodworking', 'Custom Woodworking', 'other', 'Custom-built woodwork.', ['woodworker']),
  cat('welding', 'Welding', 'other', 'Welding and metalwork.', ['welder']),
  cat('general-delivery', 'Delivery', 'other', 'General delivery service.', []),
  cat('assembly', 'Assembly', 'other', 'General assembly service.', []),
  cat('organization', 'Organization', 'other', 'General organizing service.', []),
  cat('general-cleaning', 'Cleaning', 'other', 'General cleaning service.', []),
  cat('general-labor', 'General Labor', 'other', 'General manual labor help.', []),
  cat('other-services', 'Other Services', 'other', 'Anything that doesn’t fit an existing category yet.', ['custom service', 'misc', 'other']),
];

function cat(id, name, group, description, keywords) {
  return { id, name, group, description, keywords, image: null };
}
