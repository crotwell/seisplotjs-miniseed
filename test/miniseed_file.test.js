import * as miniseed from '../src/miniseed';

var fs = require('fs');

test("load miniseed file", () => {

    let mseedData = fs.readFileSync('test/CO_JSC.mseed');
    expect(mseedData.length).toEqual(7168);
    let parsed = miniseed.parseDataRecords(mseedData.buffer);
    expect(parsed.length).toEqual(14);
    let dr = parsed[0];
    expect(dr.header.staCode).toEqual("JSC");
    expect(dr.header.netCode).toEqual("CO");
    expect(dr.header.locCode).toEqual("00");
    expect(dr.header.chanCode).toEqual("HHZ");
    let btime = dr.header.startBTime;
    expect(btime.year).toEqual(2016);
    expect(btime.jday).toEqual(265);
    expect(btime.hour).toEqual(13);
    expect(btime.min).toEqual(48);
    expect(btime.sec).toEqual(0);
    expect(btime.tenthMilli).toEqual(84);
    let startMoment = moment.utc([2016, 0, 1, 13, 48, 0, 8]);
    startMoment.dayOfYear(265);
    expect(dr.header.start).toEqual(startMoment);
    expect(dr.header.numSamples).toEqual(99);
    let decomp = parsed[0].decompress();
    expect(decomp).toBeDefined();
});
