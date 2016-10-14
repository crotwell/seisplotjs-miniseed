/**
 * Philip Crotwell
 * University of South Carolina, 2014
 * http://www.seis.sc.edu
 */

import * as seedcodec from 'seisplotjs-seedcodec';


export function parseDataRecords(arrayBuffer) {
  let dataRecords = []
  let offset = 0
  while (offset < arrayBuffer.byteLength) {
    let dataView = new DataView(arrayBuffer, offset)
    let dr = new DataRecord(dataView)
    dataRecords.push(dr)
    offset += dr.header.recordSize
  }
  return dataRecords
};


export class DataRecord {
  constructor(dataView) {
    this.header = new DataHeader(dataView)
    this.length = this.header.numSamples;
  
    this.data = new DataView(dataView.buffer, 
                             dataView.byteOffset+this.header.dataOffset,
                             this.header.recordSize-this.header.dataOffset)
    }
  decompress() {
    let decompData = seedcodec.decompress(this.header.encoding, this.data, this.header.numSamples, this.header.littleEndian);
    decompData.header = this.header;
    return decompData;
  }

  codes() {
    return this.header.netCode+"."+this.header.staCode+"."+this.header.locCode+"."+this.header.chanCode;
  }
}

export class DataHeader {

  constructor(dataView) {
    let debugDR = "";
    this.seq = makeString(dataView, 0, 6);
    this.typeCode = dataView.getUint8(6)
    this.continuationCode = dataView.getUint8(7);
    this.staCode = makeString(dataView, 8, 5);
    this.locCode = makeString(dataView, 13, 2);
    this.chanCode = makeString(dataView, 15, 3);
    this.netCode = makeString(dataView, 18, 2);
    this.startBTime = new BTime(dataView, 20)
    let headerByteSwap = checkByteSwap(this.startBTime) 
    if (headerByteSwap) {
      this.startBTime = new BTime(dataView, 20, headerByteSwap);
    }
    this.numSamples = dataView.getInt16(30, headerByteSwap);
    this.sampRateFac = dataView.getInt16(32, headerByteSwap);
    this.sampRateMul = dataView.getInt16(34, headerByteSwap);
    //activityFlags = dataView.getUint8(36)
    //ioClockFlags = dataView.getUint8(37)
    //dataQualityFlags = dataView.getUint8(38)
    this.numBlockettes = dataView.getUint8(39)
    //timeCorrection = dataView.getInt32(40, headerByteSwap)
    this.dataOffset = dataView.getUint16(44, headerByteSwap);
    this.blocketteOffset = dataView.getUint16(46, headerByteSwap);
    let offset = this.blocketteOffset;
    this.blocketteList = [];
    this.recordSize = 4096
    for (let i=0; i< this.numBlockettes; i++) {
      let nextOffset = dataView.getUint16(offset+2, headerByteSwap);
      if (nextOffset == 0) {
        // last blockette
        nextOffset = this.dataOffset
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
          this.swapBytes = true
        } else {
          this.swapBytes = false
        }
        this.littleEndian = (blockette.wordOrder === 0);
      }
    }
    this.sampleRate = this.calcSampleRate();
    this.start = this.startBTime.toDate();
    this.end = this.timeOfSample(this.numSamples-1);
  };

  toString() {
    return this.netCode+"."+this.staCode+"."+this.locCode+"."+this.chanCode+" "+this.start.toISOString()+" "+this.encoding;
  };

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
  };

  timeOfSample(i) {
    return new Date(this.start.getTime() + 1000*i/this.sampleRate);
  };
}

export class Blockette {
  constructor(dataView, offset, length, headerByteSwap) {
    this.type = dataView.getUint16(offset, headerByteSwap);
    //console.error("blockette "+offset+" "+length+" "+this.type);
    // nextOffset = dataView.getUint16(offset+2, headerByteSwap)
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
    out += String.fromCharCode(dataView.getUint8(i))
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
  };
  toString() {
    return this.year+"-"+this.jday+" "+this.hour+":"+this.min+":"+this.sec+"."+this.tenthMilli+" "+this.getDate().toISOString();
  };

  toDate() {
    return new Date(Date.UTC(this.year, 0, this.jday, this.hour, this.min, this.sec, this.tenthMilli/10));
  };
}


function checkByteSwap(bTime) {
  return bTime.year < 1960 || bTime.year > 2055;
}

export areContiguous = function(dr1, dr2) {
    let h1 = dr1.header;
    let h2 = dr2.header;
    return h1.end.getTime() < h2.start.getTime() 
        && h1.end.getTime() + 1000*1.5/h1.sampleRate > h2.start.getTime();
};

/**
 * Merges data records into a arrary of float arrays. Each float array has
 * sampleRate, start, end, netCode, staCode, locCode, chanCode as well 
 * as the function timeOfSample(integer) set.
 * This assumes all data records are from the same channel.
 */
export function merge(drList) {
  let out = [];
  let prevDR, currDR;
  let current;
  drList.sort(function(a,b) {
      return a.header.start.getTime() - b.header.start.getTime();
  });
  let firstDR = drList[0];
  let assignMetaData = function(first, current) {
    current.sampleRate = first.header.sampleRate;
    current.start = first.header.start;
    current.timeOfSample = function(i) {
      return new Date(this.start.getTime() + 1000*i/this.sampleRate);
    }
    current.end = current.timeOfSample(current.length-1);
    current.netCode = first.header.netCode;
    current.staCode = first.header.staCode;
    current.locCode = first.header.locCode;
    current.chanCode = first.header.chanCode;
    current.codes = function()  {
      return this.netCode+"."+this.staCode+"."+this.locCode+"."+this.chanCode;
    };
    current.seisId = function() {
      return (this.codes()+"_"+this.start.toISOString()+"_"+this.end.toISOString()).replace(/\./g,'_').replace(/\:/g,'');
    };
  }
  for (let i=0; i<drList.length; i++) {
    currDR = drList[i];
    if (! current || ! areContiguous(prevDR, drList[i])) {
      if (current) {
        assignMetaData(firstDR, current);
        out.push(current);
      }
      firstDR = currDR;
      current = currDR.decompress();
    } else {
      current = current.concat(currDR.decompress());
    }
    prevDR = currDR;
  }
  if (current) {
    assignMetaData(firstDR, current);
    out.push(current);
  }
  for (i=0; i<out.length; i++) {
    current = out[i];
  }
  return out;
}

export function byChannel(drList) {
  let out = {};
  let key;
  for (let i=0; i<drList.length; i++) {
    let currDR = drList[i];
    key = currDR.codes();
    if (! out[key]) {
      out[key] = [currDR]; 
    } else {
      out[key].push(currDR);
    };
  }
  return out;
}

