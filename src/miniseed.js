// @flow

/*global DataView*/
/**
 * Philip Crotwell
 * University of South Carolina, 2014
 * http://www.seis.sc.edu
 */

// special due to flow
import {hasArgs, hasNoArgs, isStringArg, isNumArg, checkStringOrDate, stringify} from 'seisplotjs-model';

import * as seedcodec from 'seisplotjs-seedcodec';
import * as model from 'seisplotjs-model';

/* re-export */
export { seedcodec, model };

/** parse arrayBuffer into an array of DataRecords. */
export function parseDataRecords(arrayBuffer: ArrayBuffer) {
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
  header: DataHeader;
  length: number;
  data: DataView;
  decompData: Array<number> | void;
  constructor(dataView: DataView) {
    this.header = new DataHeader(dataView);
  //  this.length = this.header.numSamples;

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
  seq: string;
  typeCode: number;
  continuationCode: number;
  staCode: string;
  locCode: string;
  chanCode: string;
  netCode: string;
  startBTime: BTime;
  numSamples: number;
  encoding: number;
  littleEndian: boolean;
  sampRateFac: number;
  sampRateMul: number;
  sampleRate: number;
  activityFlags: number;
  ioClockFlags: number;
  dataQualityFlags: number;
  numBlockettes: number;
  timeCorrection: number;
  dataOffset: number;
  blocketteOffset: number;
  recordSize: number;
  blocketteList: Array<Blockette>;
  start: model.moment;
  end: model.moment;
  constructor(dataView: DataView) {
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
      let blockette = new Blockette(dataView, offset, nextOffset-offset, headerByteSwap);
      if (blockette.type === 1000) {
        blockette = new Blockette1000(dataView, offset, nextOffset-offset, headerByteSwap);
      }
      this.blocketteList.push(blockette);
      offset = nextOffset;
      if (blockette instanceof Blockette1000) {
        this.recordSize = 1 << blockette.dataRecordLengthByte;
        this.encoding = blockette.encoding;
        this.littleEndian = (blockette.wordOrder === 0);
      }
    }
    this.sampleRate = this.calcSampleRate();
    this.start = this.startBTime.toMoment();
    this.end = this.timeOfSample(this.numSamples-1);
  }

  toString() {
    return this.netCode+"."+this.staCode+"."+this.locCode+"."+this.chanCode+" "+this.start.toISOString()+" "+this.encoding;
  }

  calcSampleRate() :number {
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

  timeOfSample(i: number): model.moment {
    return model.moment.utc(this.start.valueOf()).add(1000*i/this.sampleRate, 'second');
  }
}

export class Blockette {
  type: number;
  body: DataView;

  constructor(dataView: DataView, offset: number, length: number, headerByteSwap: boolean) {
    this.type = dataView.getUint16(offset, headerByteSwap);
    this.body = new DataView(dataView.buffer, dataView.byteOffset+offset, length);
  }
}


export class Blockette1000 extends Blockette {
  encoding: number;
  dataRecordLengthByte: number;
  wordOrder: number;
  constructor(dataView: DataView, offset: number, length: number, headerByteSwap: boolean) {
    super(dataView, offset, length, headerByteSwap);
    if (this.type != 1000) {throw new Error("Not a blockette1000: "+this.type);}
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
  year: number;
  jday: number;
  hour: number;
  min: number;
  sec: number;
  tenthMilli: number;
  length: number;
  constructor(dataView: DataView, offset:number, byteSwap:?boolean) {
    if ( ! byteSwap ) { byteSwap = false; }
    this.length = 10;
    this.year = dataView.getInt16(offset, byteSwap);
    this.jday = dataView.getInt16(offset+2, byteSwap);
    this.hour = dataView.getInt8(offset+4);
    this.min = dataView.getInt8(offset+5);
    this.sec = dataView.getInt8(offset+6);
    // byte 7 unused, alignment
    this.tenthMilli = dataView.getInt16(offset+8, byteSwap);
  }
  toString(): string {
    return this.year+"-"+this.jday+" "+this.hour+":"+this.min+":"+this.sec+"."+this.tenthMilli.toFixed().padStart(4,'0')+" "+this.toMoment().toISOString();
  }
  toMoment(): model.moment {
    let m = new model.moment.utc([this.year, 0, 1, this.hour, this.min, this.sec, Math.round(this.tenthMilli/10)]);
    m.dayOfYear(this.jday);
    return m;
  }
  toDate(): Date {
    return new Date(this.year, 0, this.jday, this.hour, this.min, this.sec, this.tenthMilli/10);
  }
}


function checkByteSwap(bTime): boolean {
  return bTime.year < 1960 || bTime.year > 2055;
}

export function areContiguous(dr1: DataRecord, dr2: DataRecord) {
    let h1 = dr1.header;
    let h2 = dr2.header;
    return h1.end.valueOf() < h2.start.valueOf()
        && h1.end.valueOf() + 1000*1.5/h1.sampleRate > h2.start.valueOf();
}

/** concatentates a sequence of DataRecords into a single seismogram object.
  * Assumes that they are all contiguous and in order. Header values from the first
  * DataRecord are used. */
export function createSeismogram(contig: Array<DataRecord>): model.Seismogram {
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
export function merge(drList: Array<DataRecord>): Array<model.Seismogram> {
  let out = [];
  let currDR;
  drList.sort(function(a,b) {
      return a.header.start.diff(b.header.start);
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


export function segmentMinMax(segment: model.Seismogram, minMaxAccumulator:? Array<number>) :Array<number> {
  if ( ! segment.y()) {
    throw new Error("Segment does not have a y field, doesn't look like a seismogram segment. "+stringify(segment));
  }
  let minAmp = Number.MAX_SAFE_INTEGER;
  let maxAmp = -1 * (minAmp);
  if ( minMaxAccumulator) {
    minAmp = minMaxAccumulator[0];
    maxAmp = minMaxAccumulator[1];
  }
  let yData = ((segment.y() :any) :Array<number>); // for flow
  for (let n = 0; n < yData.length; n++) {
    if (minAmp > yData[n]) {
      minAmp = yData[n];
    }
    if (maxAmp < yData[n]) {
      maxAmp = yData[n];
    }
  }
  return [ minAmp, maxAmp ];
}

/** splits a list of data records by channel code, returning a Map
  * with each NSLC string mapped to an array of data records. */
export function byChannel(drList: Array<DataRecord>): Map<string, Array<DataRecord>> {
  let out = new Map();
  let key;
  for (let i=0; i<drList.length; i++) {
    let currDR = drList[i];
    key = currDR.codes();
    let array = out.get(key);
    if ( ! array) {
      array = [currDR];
      out.set(key, array);
    } else {
      array.push(currDR);
    }
  }
  return out;
}
