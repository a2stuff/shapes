const $ = document.querySelector.bind(document);
document.addEventListener('DOMContentLoaded', e => {
  $('#go').addEventListener('click', e => {
    const text = $('#src').value;

    //console.log(vectorize(parse(split(text)[1])).map(n=>n.toString(2)));
    //console.log(pack(vectorize(parse(split(text)[1]))).map(n=>n.toString(2)));
    //return;

    const table = assemble(split(text).map(parse).map(vectorize).map(pack));
    //console.log(table);

    const blob = new Blob([table]);

    const a = document.createElement('a');
    a.download = 'shapetable.bin';
    document.body.appendChild(a);
    a.href = URL.createObjectURL(blob);
    a.click();
    a.remove();
  });
});


// Input: raw text
// Output: array of array of lines
function split(text) {
  const lines =
        text
        .split(/\r?\n/)
        .map(s => s.replace(/\s*(;.*)?$/, ''));

  let fresh = true;
  let shapes = [];
  for (const line of lines) {
    if (line === '') {
      fresh = true;
    } else {
      if (fresh) {
        fresh = false;
        shapes.push([]);
      }
      shapes[shapes.length-1].push(line);
    }
  }
  return shapes;
}

// Input: array of lines
// Output: {ox, oy, width, height, bits: [[0,1,...],...]}
function parse(shape) {
  const width = shape[0].length;
  const height = shape.length;
  if (shape.some(i => i.length !== width))
    throw Error('Inconsistent lengths');

  let ox, oy;
  const bits = shape
          .map((line, y) =>
               line
               .split('')
               .map((c, x) => {
                 switch(c) {
                 case ':': ox = x; oy = y; // fall through
                 case '.': return 0;
                 case 'X': ox = x; oy = y; // fall through
                 case '#': return 1;
                 default: throw Error(`Unexpected character: ${c}`);
                 }
               }));

  return {ox, oy, width, height, bits};
}

// up = 00, right = 01, down = 10, left = 11
// 0xx = just move, 1xx = plot and move
const UP = 0b00, RIGHT = 0b01, DOWN = 0b10, LEFT = 0b11;
const PLOT = 0b100, MOVE = 0b000;

// Input: {ox, oy, width, height, bits: [[0,1,...],...]}
// Output: sequence of numbers representing vector moves
function vectorize(shape) {
  const out = [];

  // TODO: Optimize this algorithm!

  // Move to bottom-right
  for (let x = shape.ox; x < shape.width - 1; ++x)
    out.push(RIGHT);
  for (let y = shape.oy; y < shape.height - 1; ++y)
    out.push(DOWN);

  // Start moving to left
  let dir = -1;

  // Scan back and forth, bottom to top
  for (let y = shape.height-1; y >= 0; --y) {
    for (let h = 0; h < shape.width; ++h) {
      const x = (dir > 0) ? h : (shape.width - h - 1);
      const last = (h === shape.width - 1);

      const bit = shape.bits[y][x];

      if (last)
        out.push(UP | (bit ? PLOT : MOVE));
      else
        out.push(((dir > 0) ? RIGHT : LEFT) | (bit ? PLOT : MOVE));
    }
    dir = -dir;
  }

  // Trim trailing moves
  while ((out[out.length-1] & PLOT) === 0)
    out.length -= 1;

  return out;
}

function dump(vectors) {
  return vectors.map(vec =>
                     ['UP', 'RIGHT', 'DOWN', 'LEFT',
                      'P-UP', 'P-RIGHT', 'P-DOWN', 'P-LEFT'][vec]);
}

// Input: sequence of numbers representing vector moves
// Output: sequence of bytes with 1, 2 or 3 vectors packed in
function pack(vectors) {
  const bytes = [];
  while (vectors.length) {
    let byte = vectors.shift();
    //console.log('byte: ' + byte.toString(2));

    // Assumes that there are never sequential ups.
    if ((vectors.length && vectors[0]) ||
        (vectors.length > 1 && (vectors[1] & PLOT) === 0)) {
      //console.log('appending: ' + vectors[0].toString(2));
      byte = byte | (vectors.shift() << 3);

      if (vectors.length && (vectors[0] & PLOT) === 0 && vectors[0]) {
        //console.log('appending: ' + vectors[0].toString(2));
        byte = byte | (vectors.shift() << 6);
      }
    }

    if (byte === 0) throw Error('Invalid byte generated');
    //console.log('final: ' + byte.toString(2));
    bytes.push(byte);
  }
  return bytes;
}

// Input: sequence (one per shape) of sequence of bytes
// Output: Uint8Array of full table
function assemble(shapes) {

  shapes.forEach(shape => { shape.push(0); }); // shape ends with 0

  const out = [];

  // Header
  out.push(shapes.length); // number of shapes
  out.push(0); // unused

  // Index
  let offset = 2 + shapes.length * 2; // offset to first shape
  shapes.forEach(shape => {
    out.push(offset & 0xff);
    out.push((offset >> 8) & 0xff);
    offset += shape.length;
  });

  // Shape Definitions
  shapes.forEach(shape => {
    shape.forEach(b => { out.push(b); });
  });

  return new Uint8Array(out);
}
