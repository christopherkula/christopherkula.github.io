/*
  Approximate edge of map coordinates:

  left:   -122.45673
  right:  -122.38478
  top:      37.81027
  bottom:   37.76555
*/

const MAP_HEIGHT = 5519;
const MAP_WIDTH = 7195;
const TOP_LAT = 37.81027;
const LEFT_LNG = -122.45673;
const HORIZONTAL_SCALE = 102500;
const VERTICAL_SCALE = 120000;
const TRUCK_IMG_HEIGHT = 250;
const TRUCK_IMG_WIDTH = 250;

let sfmap;         // SVG
let fullList;      // original downloaded, culled, annotated list of trucks
let displayedList; // filtered, sorted (by route) list of trucks

window.onload = () => {
  const input = document.getElementById("search");
  const submit = document.getElementById("submit");
  const footer = document.getElementById("footer");

  footer.innerHTML = new Array(10).fill("BINGEDRONE").join("<br>");

  sfmap = document.getElementById("sfmap");

  // download list and display
  fetchList().then((list) => {
    displayedList = fullList = list;
    showTrucks();
  });

  input.addEventListener("keyup", function(event) {
    if (event.key === "Enter") {
      displayedList = planRoute(displayedList);
      showRoute();
    } else {
      displayedList = filterTrucks(this.value); // filter trucks by search terms
      showTrucks();
    }
  });

  submit.addEventListener("click", function(event) {
    displayedList = planRoute(displayedList); // sort displayed trucks into a better route
    showRoute();
  });
}

// get truck data, filtering out trucks not on the map while adding ids and map pixel coordinates
async function fetchList() {
  const response = await fetch("/list.json");
  const list = await response.json()

  // assign ids and translate to pixel coordinates
  return list.map((truck, index) => ({
    id: index + 1,
    x: (truck.longitude - LEFT_LNG) * HORIZONTAL_SCALE,
    y: (TOP_LAT - truck.latitude) * VERTICAL_SCALE,
    ...truck
  })).filter((truck) => (
    truck.x >= 0 && truck.x <= MAP_WIDTH && truck.y >= 0 && truck.y <= MAP_HEIGHT // filter entries not in display area
  ));
}

// clear SVG contents and repopulate with displayed truck images and title info
function showTrucks() {
  sfmap.innerHTML = '';

  displayedList.forEach((truck) => {
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('x', truck.x - TRUCK_IMG_WIDTH/2);
    image.setAttribute('y', truck.y - TRUCK_IMG_HEIGHT/2);
    image.setAttribute('href', 'truck.png');
    image.innerHTML = `<title>** ${truck.name} **\n\n${truck.menu} * ${truck.location}</title>`;

    sfmap.appendChild(image);
  });
}

// clear route lines and redraw
function showRoute() {
  // delete previous route SVG elements
  Array.prototype.slice.call(document.getElementsByTagName('line')).forEach((item) => item.remove());

  let lastX, lastY;
  displayedList.forEach(({x, y}) => {
    if (lastX) drawRouteLine(lastX, lastY, x, y);
    [lastX, lastY] = [x, y];
  });
}

// draw line from [x1, y1] to [x2, y2]
function drawRouteLine(x1, y1, x2, y2) {
  const line = document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('stroke', "#444");
  line.setAttribute('stroke-width', 30);
  line.setAttribute('stroke-dasharray', "40, 60");
  line.setAttribute('stroke-linecap', "round");
  line.setAttribute('opacity', "40%");
  sfmap.prepend(line);
}

// returns filtered list based on fullList
// case-insensitive matching of all tokens contained in search string
// non-alphanumeric tokens are ignored
function filterTrucks(searchString) {
  const searches = searchString.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ');

  return fullList.filter((truck) => {
    const matchString = `${truck.name} ${truck.menu} ${truck.location} food trucks carts`.toLowerCase();
    return searches.every((search) => matchString.includes(search));
  });
}

// returns the passed list of trucks somewhat organized into a probably better route
// single pass "middle out" technique builds the route from the geographic center of the set
function planRoute(list) {
  if (displayedList.length < 2) return; // nowhere to go

  const source = displayedList.slice(0);

  // find middle truck and move to dest
  const [x, y] = middlePoint(displayedList);
  const [middleTruckId] = closest(source, [x, y]);
  const middleTruck = extract(source, middleTruckId);
  const dest = [middleTruck];

  // find next truck closest to middle truck and move to dest
  const [secondTruckId] = closest(source, [middleTruck.x, middleTruck.y]);
  dest.push(extract(source, secondTruckId));

  // move trucks to dest until source is empty
  while (source.length) shiftClosestTruck(source, dest);

  return dest;
}

// geographic midpoint of a set of trucks based on min and max x/y values (not an average of the set)
function middlePoint(trucks) {
  const xs = trucks.map((truck) => truck.x);
  const ys = trucks.map((truck) => truck.y);
  return [(Math.min(...xs) + Math.max(...xs))/2, (Math.min(...ys) + Math.max(...ys))/2];
}

// find the closest truck in the list to the given coordinates
// returning the truck id and its distance
function closest(trucks, [x1, y1]) {
  if (!trucks.length) return null;
  return trucks.reduce((acc, {x: x2, y: y2, id}) => {
    const dx = x1 - x2;
    const dy = y1 - y2;
    const distance = Math.sqrt((dx * dx) + (dy * dy));
    if (acc === null) return [id, distance];
    if (distance < acc[1]) return [id, distance];
    return acc;
  }, null);
}

// given a partial route (in dest), find the next closest truck (in source)
// to EITHER the head or tail of the route and append on that end;
// delete from source
function shiftClosestTruck(source, dest) {
  const [head, tail] = [dest[0], dest.slice(-1)[0]];
  const [nextHeadId, headDistance] = closest(source, [head.x, head.y]);
  const [nextTailId, tailDistance] = closest(source, [tail.x, tail.y]);

  if (headDistance < tailDistance) {
    dest.unshift(extract(source, nextHeadId));
  } else {
    dest.push(extract(source, nextTailId));
  }
}

// destructive function removes and returns entry with matching id
function extract(trucks, id) {
  const index = trucks.findIndex((truck) => truck.id === id);
  if (index === -1) return null;
  return trucks.splice(index, 1)[0];
}
