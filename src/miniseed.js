/*global DataView*/
/**
 * Philip Crotwell
 * University of South Carolina, 2014
 * http://www.seis.sc.edu
 */

import * as seedcodec from 'seisplotjs-seedcodec';
import * as model from 'seisplotjs-model';

/* re-export */
export { seedcodec, model };

/** parse arrayBuffer into an array of DataRecords. */
export function parseDataRecords(arrayBuffer) {
  let dataRecords = [];
  let offset = 0;
  while (offset < arrayBuffer.byteLength) {
    let dataView = new DataView(arrayBuffer, offset);
    let dr = new DataRecord(dataView);
    dataRecords.push(dr);
    offset += dr.header.recordSize;
  }
  return dataRecords;
}

/** Represents a SEED Data Record, with header, blockettes and data.
  * Currently only blockette 1000 is parsed, others are separated,
  * but left as just a DataView. */
export class DataRecord {
  constructor(dataView) {
    this.header = new DataHeader(dataView);
    this.length = this.header.numSamples;

    this.data = new DataView(dataView.buffer,
                             dataView.byteOffset+this.header.dataOffset,
                             this.header.recordSize-this.header.dataOffset);
    this.decompData = undefined;
    }
  decompress() {
    // only decompress once as it is expensive operation
    if ( typeof this.decompData === 'undefined') {
      this.decompData = seedcodec.decompress(this.header.encoding, this.data, this.header.numSamples, this.header.littleEndian);
      this.decompData.header = this.header;
    }
    return this.decompData;
  }

  codes() {
    return this.header.netCode+"."+this.header.staCode+"."+this.header.locCode+"."+this.header.chanCode;
  }
}

export class DataHeader {

  constructor(dataView) {
    this.seq = makeString(dataView, 0, 6);
    this.typeCode = dataView.getUint8(6);
    this.continuationCode = dataView.getUint8(7);
    this.staCode = makeString(dataView, 8, 5);
    this.locCode = makeString(dataView, 13, 2);
    this.chanCode = makeString(dataView, 15, 3);
    this.netCode = makeString(dataView, 18, 2);
    this.startBTime = new BTime(dataView, 20);
    let headerByteSwap = checkByteSwap(this.startBTime);
    if (headerByteSwap) {
      this.startBTime = new BTime(dataView, 20, headerByteSwap);
    }
    this.numSamples = dataView.getInt16(30, headerByteSwap);
    this.sampRateFac = dataView.getInt16(32, headerByteSwap);
    this.sampRateMul = dataView.getInt16(34, headerByteSwap);
    this.activityFlags = dataView.getUint8(36);
    this.ioClockFlags = dataView.getUint8(37);
    this.dataQualityFlags = dataView.getUint8(38);
    this.numBlockettes = dataView.getUint8(39);
    this.timeCorrection = dataView.getInt32(40, headerByteSwap);
    this.dataOffset = dataView.getUint16(44, headerByteSwap);
    this.blocketteOffset = dataView.getUint16(46, headerByteSwap);
    let offset = this.blocketteOffset;
    this.blocketteList = [];
    this.recordSize = 4096;
    for (let i=0; i< this.numBlockettes; i++) {
      let nextOffset = dataView.getUint16(offset+2, headerByteSwap);
      if (nextOffset == 0) {
        // last blockette
        nextOffset = this.dataOffset;
      }
      if (nextOffset == 0) {
        nextOffset = offset; // zero length, probably an error...
      }
      let blockette = new Blockette(dataView, offset, nextOffset-offset);
      this.blocketteList.push(blockette);
      offset = nextOffset;
      if (blockette.type == 1000) {
        this.recordSize = 1 << blockette.dataRecordLengthByte;
        this.encoding = blockette.encoding;
        if (blockette.wordOrder == 0) {
          this.swapBytes = true;
        } else {
          this.swapBytes = false;
        }
        this.littleEndian = (blockette.wordOrder === 0);
      }
    }
    this.sampleRate = this.calcSampleRate();
    this.start = this.startBTime.toDate();
    this.end = this.timeOfSample(this.numSamples-1);
  }

  toString() {
    return this.netCode+"."+this.staCode+"."+this.locCode+"."+this.chanCode+" "+this.start.toISOString()+" "+this.encoding;
  }

  calcSampleRate() {
    let factor = this.sampRateFac;
    let multiplier = this.sampRateMul;
    let sampleRate = 10000.0; // default (impossible) value;
    if((factor * multiplier) != 0.0) { // in the case of log records
        sampleRate = Math.pow(Math.abs(factor),
                              (factor / Math.abs(factor)))
                     * Math.pow(Math.abs(multiplier),
                              (multiplier / Math.abs(multiplier)));
    }
    return sampleRate;
  }

  timeOfSample(i) {
    return new Date(this.start.getTime() + 1000*i/this.sampleRate);
  }
}

export class Blockette {
  constructor(dataView, offset, length, headerByteSwap) {
    this.type = dataView.getUint16(offset, headerByteSwap);
    this.body = new DataView(dataView.buffer, dataView.byteOffset+offset, length);
    if (this.type == 1000) {
      this.encoding = this.body.getUint8(4);
      this.dataRecordLengthByte = this.body.getUint8(6);
      this.wordOrder = this.body.getUint8(5);
    }
  }
}

function makeString(dataView, offset, length) {
  let out = "";
  for (let i=offset; i<offset+length; i++) {
    let charCode = dataView.getUint8(i);
    if (charCode > 31) {
      out += String.fromCharCode(charCode);
    }
  }
  return out.trim();
}

export class BTime {
  constructor(dataView, offset, byteSwap) {
    if (typeof byteSwap === 'undefined') { byteSwap = false; }
    this.length = 10;
    this.year = dataView.getInt16(offset, byteSwap);
    this.jday = dataView.getInt16(offset+2, byteSwap);
    this.hour = dataView.getInt8(offset+4);
    this.min = dataView.getInt8(offset+5);
    this.sec = dataView.getInt8(offset+6);
    // byte 7 unused, alignment
    this.tenthMilli = dataView.getInt16(offset+8, byteSwap);
  }
  toString() {
    return this.year+"-"+this.jday+" "+this.hour+":"+this.min+":"+this.sec+"."+this.tenthMilli+" "+this.getDate().toISOString();
  }

  toDate() {
    return new Date(Date.UTC(this.year, 0, this.jday, this.hour, this.min, this.sec, this.tenthMilli/10));
  }
}


function checkByteSwap(bTime) {
  return bTime.year < 1960 || bTime.year > 2055;
}

export function areContiguous(dr1, dr2) {
    let h1 = dr1.header;
    let h2 = dr2.header;
    return h1.end.getTime() < h2.start.getTime()
        && h1.end.getTime() + 1000*1.5/h1.sampleRate > h2.start.getTime();
}

/** concatentates a sequence of DataRecords into a single seismogram object.
  * Assumes that they are all contiguous and in order. Header values from the first
  * DataRecord are used. */
export function createSeismogram(contig) {
  let y = [];
  for (let i=0; i<contig.length; i++) {
    y = y.concat(contig[i].decompress());
  }
  let out = new model.Seismogram(y,
                                 contig[0].header.sampleRate,
                                 contig[0].header.start);
  out.netCode(contig[0].header.netCode)
    .staCode(contig[0].header.staCode)
    .locId(contig[0].header.locCode)
    .chanCode(contig[0].header.chanCode);

  return out;
}


/**
 * Merges data records into a arrary of seismogram segment objects
 * containing the data as a float array, y. Each seismogram has
 * sampleRate, start, end, netCode, staCode, locCode, chanCode as well
 * as the function timeOfSample(integer) set.
 * This assumes all data records are from the same channel, byChannel
 * can be used first if multiple channels may be present.
 */
export function merge(drList) {
  let out = [];
  let currDR;
  drList.sort(function(a,b) {
      return a.header.start.getTime() - b.header.start.getTime();
  });
  let contig = [];
  for (let i=0; i<drList.length; i++) {
    currDR = drList[i];
    if ( contig.length == 0 ) {
      contig.push(currDR);
    } else if (areContiguous(contig[contig.length-1], currDR)) {
      contig.push(currDR);
    } else {
      //found a gap
      out.push(createSeismogram(contig));
      contig = [ currDR ];
    }
  }
  if (contig.length > 0) {
      // last segment
      out.push(createSeismogram(contig));
      contig = [];
  }
  return out;
}


export function segmentMinMax(segment, minMaxAccumulator) {
if ( ! segment.y()) {
throw new Error("Segment does not have a y field, doesn't look like a seismogram segment. "+Array.isArray(segment)+" "+segment);
}
  let minAmp = Number.MAX_SAFE_INTEGER;
  let maxAmp = -1 * (minAmp);
  if ( minMaxAccumulator) {
    minAmp = minMaxAccumulator[0];
    maxAmp = minMaxAccumulator[1];
  }
  for (let n = 0; n < segment.y().length; n++) {
    if (minAmp > segment.y()[n]) {
      minAmp = segment.y()[n];
    }
    if (maxAmp < segment.y()[n]) {
      maxAmp = segment.y()[n];
    }
  }
  return [ minAmp, maxAmp ];
}

/** splits a list of data records by channel code, returning a Map
  * with each NSLC string mapped to an array of data records. */
export function byChannel(drList) {
  let out = new Map();
  let key;
  for (let i=0; i<drList.length; i++) {
    let currDR = drList[i];
    key = currDR.codes();
    if (! out.has(key)) {
      out.set(key, [ currDR ]);
    } else {
      out.get(key).push(currDR);
    }
  }
  return out;
}
