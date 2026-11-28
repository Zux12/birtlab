// Exact subjects narrow the pool; broader topic matches can rotate among suitable alternatives.
export const visuals = [
  ['print-nozzle', 'A bioprinter nozzle over a hydrogel scaffold', /nozzle|extrusion|drop.on.demand/, /bioprint|bioink|biofabricat|3d.print/],
  ['ear-scaffold', 'An ear-shaped lattice scaffold in a laboratory dish', /\bear\b|auricl|pinna/, /auricular|ear.shaped/],
  ['printed-layers', 'Overlapping layers of printed hydrogel filaments', /print.*layer|filament|silk.*bioink|composite.*bioink/, /bioprint|bioink|biofabricat|3d.print/],
  ['porous-bone', 'A porous ceramic scaffold with interconnected openings', /porous bone|bone scaffold|bone.*wafer|bone graft/, /bone|skeletal|osteogen|osteochondr/],
  ['cartilage-layers', 'A model of cartilage over porous bone', /cartilage|osteochondr|chondral/, /joint|orthop|bone/],
  ['scaffold-volume', 'An oblique volume reconstruction of a porous scaffold', /tomograph|micro.?ct|scaffold.*(3d|pore|architect)|porosity/, /scaffold|bone|biomaterial/],
  ['glass-chip', 'A clear organ-on-chip slide with etched channels', /organ.on.(a.)?chip|microphysiolog/, /chip|microfluid|perfusion|vascular/],
  ['vascular-network', 'A branching vessel network spreading across a chip', /vessel growth|vasculogenesis|capillar|branch.*vessel|vascular network|angiogen/, /vascular|vessel|arteriol|perfusion/],
  ['chip-flow', 'Coloured fluid inside transparent microfluidic channels', /microfluid|blood flow|perfusion|arteriole|branched (channel|structure)/, /chip|vascular|vessel|arteriol/],
  ['skin-layers', 'Cross-section of an illustrative layered skin model', /epiderm|skin layer|skin model|stratifi/, /skin|dermal|wound|keratinocyt/],
  ['hydrogel-dressing', 'A clear hydrogel dressing on its backing sheet', /dressing|wound closure|wound heal/, /wound|skin repair|dermal repair/],
  ['skin-culture', 'A field of cultured skin cells with violet nuclei', /keratinocyt|skin cell|skin culture/, /skin|dermal|epiderm|wound/],
  ['image-segmentation', 'Cell microscopy with segmentation outlines', /segment|classif|image analys|machine learning|deep learning/, /imag(e|ing)|computational|artificial intelligence/],
  ['tissue-volume', 'Stacked optical sections of a digital tissue reconstruction', /digital reconstruct|optical section|volume render|volumetric|3d reconstruction/, /imag(e|ing)|tissue model|tomograph|digital/],
  ['cell-tracking', 'Cells with coloured trails tracing their movement', /cell track|time.lapse|migration|cell movement|cell motility/, /cell|imaging|bioengineer/]
].map(([id, alt, specific, broad]) => ({id, alt, specific, broad}));

export const imageById = new Map(visuals.map(image => [image.id, image]));
export const imagePath = (id, thumbnail = false) => 'assets/research-watch/' + (thumbnail ? 'thumbs/' : '') + id + '.webp';

export function chooseVisual(story, lastUsed = new Map(), otherId = '') {
  const title = (story.headline + ' ' + story.topic).toLowerCase();
  const full = (title + ' ' + story.summary).toLowerCase();
  const scored = visuals.map(image => {
    const score = image.specific.test(title) ? 4 : image.specific.test(full) ? 3 :
      image.broad.test(title) ? 2 : image.broad.test(full) ? 1 : 0;
    return {image, score};
  });
  const highest = Math.max(...scored.map(entry => entry.score));
  let options = scored.filter(entry => entry.score === highest).map(entry => entry.image);
  if (!highest) options = [imageById.get('tissue-volume')];
  if (options.length > 1) options = options.filter(image => image.id !== otherId);
  options.sort((a, b) => (lastUsed.get(a.id) ?? -1) - (lastUsed.get(b.id) ?? -1));
  return options[0];
}

export const conferenceArt = [
  {src:'assets/img/research-watch-kl.webp', alt:'Illustrated Kuala Lumpur skyline'},
  {src:'assets/img/icirm2027-banner.jpg', alt:'Official ICIRM 2027 conference banner, Kuala Lumpur'},
  {src:'assets/icirm2027/hero-banner.webp', alt:'ICIRM 2027 conference artwork featuring an illuminated tissue scaffold'}
];

export function conferenceSlot(day, launch, dayMs) {
  const offset = Math.max(0, Math.floor((day - launch) / dayMs));
  return {featured: offset % 6 < 3, art: conferenceArt[Math.floor(offset / 6) % conferenceArt.length]};
}
