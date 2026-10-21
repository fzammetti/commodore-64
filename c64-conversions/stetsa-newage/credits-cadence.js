// Original VICE NTSC capture: one complete four-page cycle, including music IRQ/VIC delays.
// Later CPU/CIA/video phase can introduce small timing differences.
export const CREDITS_CAPTURE_CYCLES = 40467804;
export const CREDITS_CAPTURE_EVENTS = [
  {
    "cycles": 0,
    "type": "page",
    "credit": 0
  },
  {
    "cycles": 0,
    "type": "phase",
    "phase": "fade-in",
    "colors": [
      0,
      11,
      12,
      15,
      1
    ]
  },
  {
    "cycles": 821,
    "type": "band",
    "band": 0,
    "color": 0
  },
  {
    "cycles": 54018,
    "type": "band",
    "band": 0,
    "color": 11
  },
  {
    "cycles": 108648,
    "type": "band",
    "band": 0,
    "color": 12
  },
  {
    "cycles": 161930,
    "type": "band",
    "band": 0,
    "color": 15
  },
  {
    "cycles": 215213,
    "type": "band",
    "band": 0,
    "color": 1
  },
  {
    "cycles": 268496,
    "type": "band",
    "band": 1,
    "color": 0
  },
  {
    "cycles": 321736,
    "type": "band",
    "band": 1,
    "color": 11
  },
  {
    "cycles": 375050,
    "type": "band",
    "band": 1,
    "color": 12
  },
  {
    "cycles": 428393,
    "type": "band",
    "band": 1,
    "color": 15
  },
  {
    "cycles": 483053,
    "type": "band",
    "band": 1,
    "color": 1
  },
  {
    "cycles": 536225,
    "type": "band",
    "band": 2,
    "color": 0
  },
  {
    "cycles": 589566,
    "type": "band",
    "band": 2,
    "color": 11
  },
  {
    "cycles": 642909,
    "type": "band",
    "band": 2,
    "color": 12
  },
  {
    "cycles": 696252,
    "type": "band",
    "band": 2,
    "color": 15
  },
  {
    "cycles": 749595,
    "type": "band",
    "band": 2,
    "color": 1
  },
  {
    "cycles": 802939,
    "type": "band",
    "band": 3,
    "color": 0
  },
  {
    "cycles": 856282,
    "type": "band",
    "band": 3,
    "color": 11
  },
  {
    "cycles": 910899,
    "type": "band",
    "band": 3,
    "color": 12
  },
  {
    "cycles": 964120,
    "type": "band",
    "band": 3,
    "color": 15
  },
  {
    "cycles": 1017456,
    "type": "band",
    "band": 3,
    "color": 1
  },
  {
    "cycles": 1070792,
    "type": "band",
    "band": 4,
    "color": 0
  },
  {
    "cycles": 1124129,
    "type": "band",
    "band": 4,
    "color": 11
  },
  {
    "cycles": 1177465,
    "type": "band",
    "band": 4,
    "color": 12
  },
  {
    "cycles": 1230802,
    "type": "band",
    "band": 4,
    "color": 15
  },
  {
    "cycles": 1285675,
    "type": "band",
    "band": 4,
    "color": 1
  },
  {
    "cycles": 1338880,
    "type": "band",
    "band": 5,
    "color": 0
  },
  {
    "cycles": 1392320,
    "type": "band",
    "band": 5,
    "color": 11
  },
  {
    "cycles": 1445617,
    "type": "band",
    "band": 5,
    "color": 12
  },
  {
    "cycles": 1498940,
    "type": "band",
    "band": 5,
    "color": 15
  },
  {
    "cycles": 1552262,
    "type": "band",
    "band": 5,
    "color": 1
  },
  {
    "cycles": 1605925,
    "type": "band",
    "band": 6,
    "color": 0
  },
  {
    "cycles": 1660651,
    "type": "band",
    "band": 6,
    "color": 11
  },
  {
    "cycles": 1713762,
    "type": "band",
    "band": 6,
    "color": 12
  },
  {
    "cycles": 1766872,
    "type": "band",
    "band": 6,
    "color": 15
  },
  {
    "cycles": 1820154,
    "type": "band",
    "band": 6,
    "color": 1
  },
  {
    "cycles": 1873438,
    "type": "band",
    "band": 7,
    "color": 0
  },
  {
    "cycles": 1926721,
    "type": "band",
    "band": 7,
    "color": 11
  },
  {
    "cycles": 1979961,
    "type": "band",
    "band": 7,
    "color": 12
  },
  {
    "cycles": 2034819,
    "type": "band",
    "band": 7,
    "color": 15
  },
  {
    "cycles": 2088119,
    "type": "band",
    "band": 7,
    "color": 1
  },
  {
    "cycles": 2141290,
    "type": "band",
    "band": 8,
    "color": 0
  },
  {
    "cycles": 2194504,
    "type": "band",
    "band": 8,
    "color": 11
  },
  {
    "cycles": 2247803,
    "type": "band",
    "band": 8,
    "color": 12
  },
  {
    "cycles": 2301145,
    "type": "band",
    "band": 8,
    "color": 15
  },
  {
    "cycles": 2354487,
    "type": "band",
    "band": 8,
    "color": 1
  },
  {
    "cycles": 2409541,
    "type": "band",
    "band": 9,
    "color": 0
  },
  {
    "cycles": 2462840,
    "type": "band",
    "band": 9,
    "color": 11
  },
  {
    "cycles": 2516092,
    "type": "band",
    "band": 9,
    "color": 12
  },
  {
    "cycles": 2569275,
    "type": "band",
    "band": 9,
    "color": 15
  },
  {
    "cycles": 2622525,
    "type": "band",
    "band": 9,
    "color": 1
  },
  {
    "cycles": 2675863,
    "type": "band",
    "band": 10,
    "color": 0
  },
  {
    "cycles": 2729199,
    "type": "band",
    "band": 10,
    "color": 11
  },
  {
    "cycles": 2782535,
    "type": "band",
    "band": 10,
    "color": 12
  },
  {
    "cycles": 2837462,
    "type": "band",
    "band": 10,
    "color": 15
  },
  {
    "cycles": 2890701,
    "type": "band",
    "band": 10,
    "color": 1
  },
  {
    "cycles": 2943856,
    "type": "band",
    "band": 11,
    "color": 0
  },
  {
    "cycles": 2996966,
    "type": "band",
    "band": 11,
    "color": 11
  },
  {
    "cycles": 3050163,
    "type": "band",
    "band": 11,
    "color": 12
  },
  {
    "cycles": 3103445,
    "type": "band",
    "band": 11,
    "color": 15
  },
  {
    "cycles": 3156727,
    "type": "band",
    "band": 11,
    "color": 1
  },
  {
    "cycles": 3210754,
    "type": "phase",
    "phase": "hold"
  },
  {
    "cycles": 6716530,
    "type": "phase",
    "phase": "fade-out",
    "colors": [
      1,
      15,
      12,
      11,
      0
    ]
  },
  {
    "cycles": 6717260,
    "type": "band",
    "band": 0,
    "color": 1
  },
  {
    "cycles": 6770543,
    "type": "band",
    "band": 0,
    "color": 15
  },
  {
    "cycles": 6825123,
    "type": "band",
    "band": 0,
    "color": 12
  },
  {
    "cycles": 6878232,
    "type": "band",
    "band": 0,
    "color": 11
  },
  {
    "cycles": 6931559,
    "type": "band",
    "band": 0,
    "color": 0
  },
  {
    "cycles": 6984903,
    "type": "band",
    "band": 1,
    "color": 1
  },
  {
    "cycles": 7038246,
    "type": "band",
    "band": 1,
    "color": 15
  },
  {
    "cycles": 7091589,
    "type": "band",
    "band": 1,
    "color": 12
  },
  {
    "cycles": 7144931,
    "type": "band",
    "band": 1,
    "color": 11
  },
  {
    "cycles": 7199719,
    "type": "band",
    "band": 1,
    "color": 0
  },
  {
    "cycles": 7252891,
    "type": "band",
    "band": 2,
    "color": 1
  },
  {
    "cycles": 7306105,
    "type": "band",
    "band": 2,
    "color": 15
  },
  {
    "cycles": 7359448,
    "type": "band",
    "band": 2,
    "color": 12
  },
  {
    "cycles": 7412791,
    "type": "band",
    "band": 2,
    "color": 11
  },
  {
    "cycles": 7466134,
    "type": "band",
    "band": 2,
    "color": 0
  },
  {
    "cycles": 7519486,
    "type": "band",
    "band": 3,
    "color": 1
  },
  {
    "cycles": 7574486,
    "type": "band",
    "band": 3,
    "color": 15
  },
  {
    "cycles": 7627694,
    "type": "band",
    "band": 3,
    "color": 12
  },
  {
    "cycles": 7680856,
    "type": "band",
    "band": 3,
    "color": 11
  },
  {
    "cycles": 7734106,
    "type": "band",
    "band": 3,
    "color": 0
  },
  {
    "cycles": 7787442,
    "type": "band",
    "band": 4,
    "color": 1
  },
  {
    "cycles": 7840777,
    "type": "band",
    "band": 4,
    "color": 15
  },
  {
    "cycles": 7894114,
    "type": "band",
    "band": 4,
    "color": 12
  },
  {
    "cycles": 7947554,
    "type": "band",
    "band": 4,
    "color": 11
  },
  {
    "cycles": 8002322,
    "type": "band",
    "band": 4,
    "color": 0
  },
  {
    "cycles": 8055473,
    "type": "band",
    "band": 5,
    "color": 1
  },
  {
    "cycles": 8108623,
    "type": "band",
    "band": 5,
    "color": 15
  },
  {
    "cycles": 8162298,
    "type": "band",
    "band": 5,
    "color": 12
  },
  {
    "cycles": 8215620,
    "type": "band",
    "band": 5,
    "color": 11
  },
  {
    "cycles": 8268898,
    "type": "band",
    "band": 5,
    "color": 0
  },
  {
    "cycles": 8322180,
    "type": "band",
    "band": 6,
    "color": 1
  },
  {
    "cycles": 8376973,
    "type": "band",
    "band": 6,
    "color": 15
  },
  {
    "cycles": 8430212,
    "type": "band",
    "band": 6,
    "color": 12
  },
  {
    "cycles": 8483323,
    "type": "band",
    "band": 6,
    "color": 11
  },
  {
    "cycles": 8536434,
    "type": "band",
    "band": 6,
    "color": 0
  },
  {
    "cycles": 8589782,
    "type": "band",
    "band": 7,
    "color": 1
  },
  {
    "cycles": 8643125,
    "type": "band",
    "band": 7,
    "color": 15
  },
  {
    "cycles": 8696467,
    "type": "band",
    "band": 7,
    "color": 12
  },
  {
    "cycles": 8751477,
    "type": "band",
    "band": 7,
    "color": 11
  },
  {
    "cycles": 8804820,
    "type": "band",
    "band": 7,
    "color": 0
  },
  {
    "cycles": 8858077,
    "type": "band",
    "band": 8,
    "color": 1
  },
  {
    "cycles": 8911247,
    "type": "band",
    "band": 8,
    "color": 15
  },
  {
    "cycles": 8964459,
    "type": "band",
    "band": 8,
    "color": 12
  },
  {
    "cycles": 9017802,
    "type": "band",
    "band": 8,
    "color": 11
  },
  {
    "cycles": 9071144,
    "type": "band",
    "band": 8,
    "color": 0
  },
  {
    "cycles": 9126036,
    "type": "band",
    "band": 9,
    "color": 1
  },
  {
    "cycles": 9179372,
    "type": "band",
    "band": 9,
    "color": 15
  },
  {
    "cycles": 9232709,
    "type": "band",
    "band": 9,
    "color": 12
  },
  {
    "cycles": 9285917,
    "type": "band",
    "band": 9,
    "color": 11
  },
  {
    "cycles": 9339082,
    "type": "band",
    "band": 9,
    "color": 0
  },
  {
    "cycles": 9392397,
    "type": "band",
    "band": 10,
    "color": 1
  },
  {
    "cycles": 9445680,
    "type": "band",
    "band": 10,
    "color": 15
  },
  {
    "cycles": 9500474,
    "type": "band",
    "band": 10,
    "color": 12
  },
  {
    "cycles": 9553757,
    "type": "band",
    "band": 10,
    "color": 11
  },
  {
    "cycles": 9607040,
    "type": "band",
    "band": 10,
    "color": 0
  },
  {
    "cycles": 9660281,
    "type": "band",
    "band": 11,
    "color": 1
  },
  {
    "cycles": 9713435,
    "type": "band",
    "band": 11,
    "color": 15
  },
  {
    "cycles": 9766546,
    "type": "band",
    "band": 11,
    "color": 12
  },
  {
    "cycles": 9820139,
    "type": "band",
    "band": 11,
    "color": 11
  },
  {
    "cycles": 9873421,
    "type": "band",
    "band": 11,
    "color": 0
  },
  {
    "cycles": 9970800,
    "type": "page-end",
    "credit": 0
  },
  {
    "cycles": 9970800,
    "type": "page",
    "credit": 1
  },
  {
    "cycles": 9970800,
    "type": "phase",
    "phase": "fade-in",
    "colors": [
      0,
      11,
      12,
      15,
      1
    ]
  },
  {
    "cycles": 9971493,
    "type": "band",
    "band": 0,
    "color": 0
  },
  {
    "cycles": 10024689,
    "type": "band",
    "band": 0,
    "color": 11
  },
  {
    "cycles": 10077971,
    "type": "band",
    "band": 0,
    "color": 12
  },
  {
    "cycles": 10132901,
    "type": "band",
    "band": 0,
    "color": 15
  },
  {
    "cycles": 10186207,
    "type": "band",
    "band": 0,
    "color": 1
  },
  {
    "cycles": 10239507,
    "type": "band",
    "band": 1,
    "color": 0
  },
  {
    "cycles": 10292847,
    "type": "band",
    "band": 1,
    "color": 11
  },
  {
    "cycles": 10346060,
    "type": "band",
    "band": 1,
    "color": 12
  },
  {
    "cycles": 10399231,
    "type": "band",
    "band": 1,
    "color": 15
  },
  {
    "cycles": 10452531,
    "type": "band",
    "band": 1,
    "color": 1
  },
  {
    "cycles": 10507405,
    "type": "band",
    "band": 2,
    "color": 0
  },
  {
    "cycles": 10560748,
    "type": "band",
    "band": 2,
    "color": 11
  },
  {
    "cycles": 10614090,
    "type": "band",
    "band": 2,
    "color": 12
  },
  {
    "cycles": 10667388,
    "type": "band",
    "band": 2,
    "color": 15
  },
  {
    "cycles": 10720729,
    "type": "band",
    "band": 2,
    "color": 1
  },
  {
    "cycles": 10773911,
    "type": "band",
    "band": 3,
    "color": 0
  },
  {
    "cycles": 10827072,
    "type": "band",
    "band": 3,
    "color": 11
  },
  {
    "cycles": 10881937,
    "type": "band",
    "band": 3,
    "color": 12
  },
  {
    "cycles": 10935272,
    "type": "band",
    "band": 3,
    "color": 15
  },
  {
    "cycles": 10988565,
    "type": "band",
    "band": 3,
    "color": 1
  },
  {
    "cycles": 11041901,
    "type": "band",
    "band": 4,
    "color": 0
  },
  {
    "cycles": 11095237,
    "type": "band",
    "band": 4,
    "color": 11
  },
  {
    "cycles": 11148531,
    "type": "band",
    "band": 4,
    "color": 12
  },
  {
    "cycles": 11201695,
    "type": "band",
    "band": 4,
    "color": 15
  },
  {
    "cycles": 11256596,
    "type": "band",
    "band": 4,
    "color": 1
  },
  {
    "cycles": 11309919,
    "type": "band",
    "band": 5,
    "color": 0
  },
  {
    "cycles": 11363241,
    "type": "band",
    "band": 5,
    "color": 11
  },
  {
    "cycles": 11416939,
    "type": "band",
    "band": 5,
    "color": 12
  },
  {
    "cycles": 11470235,
    "type": "band",
    "band": 5,
    "color": 15
  },
  {
    "cycles": 11523558,
    "type": "band",
    "band": 5,
    "color": 1
  },
  {
    "cycles": 11576713,
    "type": "band",
    "band": 6,
    "color": 0
  },
  {
    "cycles": 11631250,
    "type": "band",
    "band": 6,
    "color": 11
  },
  {
    "cycles": 11684532,
    "type": "band",
    "band": 6,
    "color": 12
  },
  {
    "cycles": 11737815,
    "type": "band",
    "band": 6,
    "color": 15
  },
  {
    "cycles": 11791097,
    "type": "band",
    "band": 6,
    "color": 1
  },
  {
    "cycles": 11844425,
    "type": "band",
    "band": 7,
    "color": 0
  },
  {
    "cycles": 11897768,
    "type": "band",
    "band": 7,
    "color": 11
  },
  {
    "cycles": 11951068,
    "type": "band",
    "band": 7,
    "color": 12
  },
  {
    "cycles": 12004282,
    "type": "band",
    "band": 7,
    "color": 15
  },
  {
    "cycles": 12058942,
    "type": "band",
    "band": 7,
    "color": 1
  },
  {
    "cycles": 12112286,
    "type": "band",
    "band": 8,
    "color": 0
  },
  {
    "cycles": 12165629,
    "type": "band",
    "band": 8,
    "color": 11
  },
  {
    "cycles": 12218972,
    "type": "band",
    "band": 8,
    "color": 12
  },
  {
    "cycles": 12272315,
    "type": "band",
    "band": 8,
    "color": 15
  },
  {
    "cycles": 12325615,
    "type": "band",
    "band": 8,
    "color": 1
  },
  {
    "cycles": 12378958,
    "type": "band",
    "band": 9,
    "color": 0
  },
  {
    "cycles": 12433674,
    "type": "band",
    "band": 9,
    "color": 11
  },
  {
    "cycles": 12486968,
    "type": "band",
    "band": 9,
    "color": 12
  },
  {
    "cycles": 12540305,
    "type": "band",
    "band": 9,
    "color": 15
  },
  {
    "cycles": 12593641,
    "type": "band",
    "band": 9,
    "color": 1
  },
  {
    "cycles": 12647086,
    "type": "band",
    "band": 10,
    "color": 0
  },
  {
    "cycles": 12700343,
    "type": "band",
    "band": 10,
    "color": 11
  },
  {
    "cycles": 12753626,
    "type": "band",
    "band": 10,
    "color": 12
  },
  {
    "cycles": 12808205,
    "type": "band",
    "band": 10,
    "color": 15
  },
  {
    "cycles": 12861415,
    "type": "band",
    "band": 10,
    "color": 1
  },
  {
    "cycles": 12914698,
    "type": "band",
    "band": 11,
    "color": 0
  },
  {
    "cycles": 12967880,
    "type": "band",
    "band": 11,
    "color": 11
  },
  {
    "cycles": 13021162,
    "type": "band",
    "band": 11,
    "color": 12
  },
  {
    "cycles": 13075036,
    "type": "band",
    "band": 11,
    "color": 15
  },
  {
    "cycles": 13128779,
    "type": "band",
    "band": 11,
    "color": 1
  },
  {
    "cycles": 13183351,
    "type": "phase",
    "phase": "hold"
  },
  {
    "cycles": 16723179,
    "type": "phase",
    "phase": "fade-out",
    "colors": [
      1,
      15,
      12,
      11,
      0
    ]
  },
  {
    "cycles": 16723866,
    "type": "band",
    "band": 0,
    "color": 1
  },
  {
    "cycles": 16779420,
    "type": "band",
    "band": 0,
    "color": 15
  },
  {
    "cycles": 16833195,
    "type": "band",
    "band": 0,
    "color": 12
  },
  {
    "cycles": 16886979,
    "type": "band",
    "band": 0,
    "color": 11
  },
  {
    "cycles": 16940806,
    "type": "band",
    "band": 0,
    "color": 0
  },
  {
    "cycles": 16994590,
    "type": "band",
    "band": 1,
    "color": 1
  },
  {
    "cycles": 17048246,
    "type": "band",
    "band": 1,
    "color": 15
  },
  {
    "cycles": 17103584,
    "type": "band",
    "band": 1,
    "color": 12
  },
  {
    "cycles": 17157438,
    "type": "band",
    "band": 1,
    "color": 11
  },
  {
    "cycles": 17211241,
    "type": "band",
    "band": 1,
    "color": 0
  },
  {
    "cycles": 17265025,
    "type": "band",
    "band": 2,
    "color": 1
  },
  {
    "cycles": 17318862,
    "type": "band",
    "band": 2,
    "color": 15
  },
  {
    "cycles": 17372537,
    "type": "band",
    "band": 2,
    "color": 12
  },
  {
    "cycles": 17427835,
    "type": "band",
    "band": 2,
    "color": 11
  },
  {
    "cycles": 17481671,
    "type": "band",
    "band": 2,
    "color": 0
  },
  {
    "cycles": 17535480,
    "type": "band",
    "band": 3,
    "color": 1
  },
  {
    "cycles": 17589258,
    "type": "band",
    "band": 3,
    "color": 15
  },
  {
    "cycles": 17643079,
    "type": "band",
    "band": 3,
    "color": 12
  },
  {
    "cycles": 17696689,
    "type": "band",
    "band": 3,
    "color": 11
  },
  {
    "cycles": 17752200,
    "type": "band",
    "band": 3,
    "color": 0
  },
  {
    "cycles": 17805948,
    "type": "band",
    "band": 4,
    "color": 1
  },
  {
    "cycles": 17859717,
    "type": "band",
    "band": 4,
    "color": 15
  },
  {
    "cycles": 17913442,
    "type": "band",
    "band": 4,
    "color": 12
  },
  {
    "cycles": 17967378,
    "type": "band",
    "band": 4,
    "color": 11
  },
  {
    "cycles": 18020991,
    "type": "band",
    "band": 4,
    "color": 0
  },
  {
    "cycles": 18076160,
    "type": "band",
    "band": 5,
    "color": 1
  },
  {
    "cycles": 18129967,
    "type": "band",
    "band": 5,
    "color": 15
  },
  {
    "cycles": 18183801,
    "type": "band",
    "band": 5,
    "color": 12
  },
  {
    "cycles": 18237583,
    "type": "band",
    "band": 5,
    "color": 11
  },
  {
    "cycles": 18291417,
    "type": "band",
    "band": 5,
    "color": 0
  },
  {
    "cycles": 18345118,
    "type": "band",
    "band": 6,
    "color": 1
  },
  {
    "cycles": 18400262,
    "type": "band",
    "band": 6,
    "color": 15
  },
  {
    "cycles": 18454088,
    "type": "band",
    "band": 6,
    "color": 12
  },
  {
    "cycles": 18507832,
    "type": "band",
    "band": 6,
    "color": 11
  },
  {
    "cycles": 18561604,
    "type": "band",
    "band": 6,
    "color": 0
  },
  {
    "cycles": 18615432,
    "type": "band",
    "band": 7,
    "color": 1
  },
  {
    "cycles": 18669259,
    "type": "band",
    "band": 7,
    "color": 15
  },
  {
    "cycles": 18724601,
    "type": "band",
    "band": 7,
    "color": 12
  },
  {
    "cycles": 18778430,
    "type": "band",
    "band": 7,
    "color": 11
  },
  {
    "cycles": 18832215,
    "type": "band",
    "band": 7,
    "color": 0
  },
  {
    "cycles": 18886042,
    "type": "band",
    "band": 8,
    "color": 1
  },
  {
    "cycles": 18939881,
    "type": "band",
    "band": 8,
    "color": 15
  },
  {
    "cycles": 18995324,
    "type": "band",
    "band": 8,
    "color": 12
  },
  {
    "cycles": 19048905,
    "type": "band",
    "band": 8,
    "color": 11
  },
  {
    "cycles": 19102666,
    "type": "band",
    "band": 8,
    "color": 0
  },
  {
    "cycles": 19156464,
    "type": "band",
    "band": 9,
    "color": 1
  },
  {
    "cycles": 19210348,
    "type": "band",
    "band": 9,
    "color": 15
  },
  {
    "cycles": 19264072,
    "type": "band",
    "band": 9,
    "color": 12
  },
  {
    "cycles": 19319411,
    "type": "band",
    "band": 9,
    "color": 11
  },
  {
    "cycles": 19372950,
    "type": "band",
    "band": 9,
    "color": 0
  },
  {
    "cycles": 19426644,
    "type": "band",
    "band": 10,
    "color": 1
  },
  {
    "cycles": 19480409,
    "type": "band",
    "band": 10,
    "color": 15
  },
  {
    "cycles": 19534116,
    "type": "band",
    "band": 10,
    "color": 12
  },
  {
    "cycles": 19587828,
    "type": "band",
    "band": 10,
    "color": 11
  },
  {
    "cycles": 19643574,
    "type": "band",
    "band": 10,
    "color": 0
  },
  {
    "cycles": 19697170,
    "type": "band",
    "band": 11,
    "color": 1
  },
  {
    "cycles": 19750722,
    "type": "band",
    "band": 11,
    "color": 15
  },
  {
    "cycles": 19804532,
    "type": "band",
    "band": 11,
    "color": 12
  },
  {
    "cycles": 19858214,
    "type": "band",
    "band": 11,
    "color": 11
  },
  {
    "cycles": 19912026,
    "type": "band",
    "band": 11,
    "color": 0
  },
  {
    "cycles": 20010224,
    "type": "page-end",
    "credit": 1
  },
  {
    "cycles": 20010224,
    "type": "page",
    "credit": 2
  },
  {
    "cycles": 20010224,
    "type": "phase",
    "phase": "fade-in",
    "colors": [
      0,
      11,
      12,
      15,
      1
    ]
  },
  {
    "cycles": 20010960,
    "type": "band",
    "band": 0,
    "color": 0
  },
  {
    "cycles": 20064787,
    "type": "band",
    "band": 0,
    "color": 11
  },
  {
    "cycles": 20120225,
    "type": "band",
    "band": 0,
    "color": 12
  },
  {
    "cycles": 20174023,
    "type": "band",
    "band": 0,
    "color": 15
  },
  {
    "cycles": 20227634,
    "type": "band",
    "band": 0,
    "color": 1
  },
  {
    "cycles": 20281290,
    "type": "band",
    "band": 1,
    "color": 0
  },
  {
    "cycles": 20335144,
    "type": "band",
    "band": 1,
    "color": 11
  },
  {
    "cycles": 20388946,
    "type": "band",
    "band": 1,
    "color": 12
  },
  {
    "cycles": 20444464,
    "type": "band",
    "band": 1,
    "color": 15
  },
  {
    "cycles": 20498279,
    "type": "band",
    "band": 1,
    "color": 1
  },
  {
    "cycles": 20551935,
    "type": "band",
    "band": 2,
    "color": 0
  },
  {
    "cycles": 20605553,
    "type": "band",
    "band": 2,
    "color": 11
  },
  {
    "cycles": 20659389,
    "type": "band",
    "band": 2,
    "color": 12
  },
  {
    "cycles": 20713198,
    "type": "band",
    "band": 2,
    "color": 15
  },
  {
    "cycles": 20768833,
    "type": "band",
    "band": 2,
    "color": 1
  },
  {
    "cycles": 20822655,
    "type": "band",
    "band": 3,
    "color": 0
  },
  {
    "cycles": 20876347,
    "type": "band",
    "band": 3,
    "color": 11
  },
  {
    "cycles": 20929900,
    "type": "band",
    "band": 3,
    "color": 12
  },
  {
    "cycles": 20983636,
    "type": "band",
    "band": 3,
    "color": 15
  },
  {
    "cycles": 21037564,
    "type": "band",
    "band": 3,
    "color": 1
  },
  {
    "cycles": 21092968,
    "type": "band",
    "band": 4,
    "color": 0
  },
  {
    "cycles": 21146759,
    "type": "band",
    "band": 4,
    "color": 11
  },
  {
    "cycles": 21200416,
    "type": "band",
    "band": 4,
    "color": 12
  },
  {
    "cycles": 21254093,
    "type": "band",
    "band": 4,
    "color": 15
  },
  {
    "cycles": 21307707,
    "type": "band",
    "band": 4,
    "color": 1
  },
  {
    "cycles": 21361514,
    "type": "band",
    "band": 5,
    "color": 0
  },
  {
    "cycles": 21416978,
    "type": "band",
    "band": 5,
    "color": 11
  },
  {
    "cycles": 21470800,
    "type": "band",
    "band": 5,
    "color": 12
  },
  {
    "cycles": 21524593,
    "type": "band",
    "band": 5,
    "color": 15
  },
  {
    "cycles": 21578200,
    "type": "band",
    "band": 5,
    "color": 1
  },
  {
    "cycles": 21631783,
    "type": "band",
    "band": 6,
    "color": 0
  },
  {
    "cycles": 21685614,
    "type": "band",
    "band": 6,
    "color": 11
  },
  {
    "cycles": 21741202,
    "type": "band",
    "band": 6,
    "color": 12
  },
  {
    "cycles": 21794986,
    "type": "band",
    "band": 6,
    "color": 15
  },
  {
    "cycles": 21848812,
    "type": "band",
    "band": 6,
    "color": 1
  },
  {
    "cycles": 21902468,
    "type": "band",
    "band": 7,
    "color": 0
  },
  {
    "cycles": 21956124,
    "type": "band",
    "band": 7,
    "color": 11
  },
  {
    "cycles": 22009909,
    "type": "band",
    "band": 7,
    "color": 12
  },
  {
    "cycles": 22065446,
    "type": "band",
    "band": 7,
    "color": 15
  },
  {
    "cycles": 22119249,
    "type": "band",
    "band": 7,
    "color": 1
  },
  {
    "cycles": 22173084,
    "type": "band",
    "band": 8,
    "color": 0
  },
  {
    "cycles": 22226792,
    "type": "band",
    "band": 8,
    "color": 11
  },
  {
    "cycles": 22280425,
    "type": "band",
    "band": 8,
    "color": 12
  },
  {
    "cycles": 22334178,
    "type": "band",
    "band": 8,
    "color": 15
  },
  {
    "cycles": 22389687,
    "type": "band",
    "band": 8,
    "color": 1
  },
  {
    "cycles": 22443497,
    "type": "band",
    "band": 9,
    "color": 0
  },
  {
    "cycles": 22497361,
    "type": "band",
    "band": 9,
    "color": 11
  },
  {
    "cycles": 22551040,
    "type": "band",
    "band": 9,
    "color": 12
  },
  {
    "cycles": 22604509,
    "type": "band",
    "band": 9,
    "color": 15
  },
  {
    "cycles": 22658135,
    "type": "band",
    "band": 9,
    "color": 1
  },
  {
    "cycles": 22713737,
    "type": "band",
    "band": 10,
    "color": 0
  },
  {
    "cycles": 22767506,
    "type": "band",
    "band": 10,
    "color": 11
  },
  {
    "cycles": 22821231,
    "type": "band",
    "band": 10,
    "color": 12
  },
  {
    "cycles": 22875210,
    "type": "band",
    "band": 10,
    "color": 15
  },
  {
    "cycles": 22928692,
    "type": "band",
    "band": 10,
    "color": 1
  },
  {
    "cycles": 22983951,
    "type": "band",
    "band": 11,
    "color": 0
  },
  {
    "cycles": 23037718,
    "type": "band",
    "band": 11,
    "color": 11
  },
  {
    "cycles": 23091509,
    "type": "band",
    "band": 11,
    "color": 12
  },
  {
    "cycles": 23145252,
    "type": "band",
    "band": 11,
    "color": 15
  },
  {
    "cycles": 23199002,
    "type": "band",
    "band": 11,
    "color": 1
  },
  {
    "cycles": 23251935,
    "type": "phase",
    "phase": "hold"
  },
  {
    "cycles": 26810770,
    "type": "phase",
    "phase": "fade-out",
    "colors": [
      1,
      15,
      12,
      11,
      0
    ]
  },
  {
    "cycles": 26811500,
    "type": "band",
    "band": 0,
    "color": 1
  },
  {
    "cycles": 26866457,
    "type": "band",
    "band": 0,
    "color": 15
  },
  {
    "cycles": 26923658,
    "type": "band",
    "band": 0,
    "color": 12
  },
  {
    "cycles": 26978512,
    "type": "band",
    "band": 0,
    "color": 11
  },
  {
    "cycles": 27033297,
    "type": "band",
    "band": 0,
    "color": 0
  },
  {
    "cycles": 27088308,
    "type": "band",
    "band": 1,
    "color": 1
  },
  {
    "cycles": 27145342,
    "type": "band",
    "band": 1,
    "color": 15
  },
  {
    "cycles": 27200482,
    "type": "band",
    "band": 1,
    "color": 12
  },
  {
    "cycles": 27255038,
    "type": "band",
    "band": 1,
    "color": 11
  },
  {
    "cycles": 27310119,
    "type": "band",
    "band": 1,
    "color": 0
  },
  {
    "cycles": 27367317,
    "type": "band",
    "band": 2,
    "color": 1
  },
  {
    "cycles": 27422326,
    "type": "band",
    "band": 2,
    "color": 15
  },
  {
    "cycles": 27477092,
    "type": "band",
    "band": 2,
    "color": 12
  },
  {
    "cycles": 27531834,
    "type": "band",
    "band": 2,
    "color": 11
  },
  {
    "cycles": 27589165,
    "type": "band",
    "band": 2,
    "color": 0
  },
  {
    "cycles": 27644033,
    "type": "band",
    "band": 3,
    "color": 1
  },
  {
    "cycles": 27698786,
    "type": "band",
    "band": 3,
    "color": 15
  },
  {
    "cycles": 27753768,
    "type": "band",
    "band": 3,
    "color": 12
  },
  {
    "cycles": 27810253,
    "type": "band",
    "band": 3,
    "color": 11
  },
  {
    "cycles": 27865207,
    "type": "band",
    "band": 3,
    "color": 0
  },
  {
    "cycles": 27920023,
    "type": "band",
    "band": 4,
    "color": 1
  },
  {
    "cycles": 27974693,
    "type": "band",
    "band": 4,
    "color": 15
  },
  {
    "cycles": 28032076,
    "type": "band",
    "band": 4,
    "color": 12
  },
  {
    "cycles": 28086964,
    "type": "band",
    "band": 4,
    "color": 11
  },
  {
    "cycles": 28141874,
    "type": "band",
    "band": 4,
    "color": 0
  },
  {
    "cycles": 28196694,
    "type": "band",
    "band": 5,
    "color": 1
  },
  {
    "cycles": 28253774,
    "type": "band",
    "band": 5,
    "color": 15
  },
  {
    "cycles": 28308865,
    "type": "band",
    "band": 5,
    "color": 12
  },
  {
    "cycles": 28363664,
    "type": "band",
    "band": 5,
    "color": 11
  },
  {
    "cycles": 28418556,
    "type": "band",
    "band": 5,
    "color": 0
  },
  {
    "cycles": 28475586,
    "type": "band",
    "band": 6,
    "color": 1
  },
  {
    "cycles": 28530612,
    "type": "band",
    "band": 6,
    "color": 15
  },
  {
    "cycles": 28585676,
    "type": "band",
    "band": 6,
    "color": 12
  },
  {
    "cycles": 28640259,
    "type": "band",
    "band": 6,
    "color": 11
  },
  {
    "cycles": 28697673,
    "type": "band",
    "band": 6,
    "color": 0
  },
  {
    "cycles": 28752571,
    "type": "band",
    "band": 7,
    "color": 1
  },
  {
    "cycles": 28807580,
    "type": "band",
    "band": 7,
    "color": 15
  },
  {
    "cycles": 28862362,
    "type": "band",
    "band": 7,
    "color": 12
  },
  {
    "cycles": 28919351,
    "type": "band",
    "band": 7,
    "color": 11
  },
  {
    "cycles": 28974488,
    "type": "band",
    "band": 7,
    "color": 0
  },
  {
    "cycles": 29029077,
    "type": "band",
    "band": 8,
    "color": 1
  },
  {
    "cycles": 29083521,
    "type": "band",
    "band": 8,
    "color": 15
  },
  {
    "cycles": 29140559,
    "type": "band",
    "band": 8,
    "color": 12
  },
  {
    "cycles": 29195390,
    "type": "band",
    "band": 8,
    "color": 11
  },
  {
    "cycles": 29250472,
    "type": "band",
    "band": 8,
    "color": 0
  },
  {
    "cycles": 29305242,
    "type": "band",
    "band": 9,
    "color": 1
  },
  {
    "cycles": 29362247,
    "type": "band",
    "band": 9,
    "color": 15
  },
  {
    "cycles": 29417182,
    "type": "band",
    "band": 9,
    "color": 12
  },
  {
    "cycles": 29471700,
    "type": "band",
    "band": 9,
    "color": 11
  },
  {
    "cycles": 29526549,
    "type": "band",
    "band": 9,
    "color": 0
  },
  {
    "cycles": 29583471,
    "type": "band",
    "band": 10,
    "color": 1
  },
  {
    "cycles": 29638383,
    "type": "band",
    "band": 10,
    "color": 15
  },
  {
    "cycles": 29693493,
    "type": "band",
    "band": 10,
    "color": 12
  },
  {
    "cycles": 29748301,
    "type": "band",
    "band": 10,
    "color": 11
  },
  {
    "cycles": 29805146,
    "type": "band",
    "band": 10,
    "color": 0
  },
  {
    "cycles": 29860162,
    "type": "band",
    "band": 11,
    "color": 1
  },
  {
    "cycles": 29915082,
    "type": "band",
    "band": 11,
    "color": 15
  },
  {
    "cycles": 29970118,
    "type": "band",
    "band": 11,
    "color": 12
  },
  {
    "cycles": 30026888,
    "type": "band",
    "band": 11,
    "color": 11
  },
  {
    "cycles": 30081998,
    "type": "band",
    "band": 11,
    "color": 0
  },
  {
    "cycles": 30182600,
    "type": "page-end",
    "credit": 2
  },
  {
    "cycles": 30182600,
    "type": "page",
    "credit": 3
  },
  {
    "cycles": 30182600,
    "type": "phase",
    "phase": "fade-in",
    "colors": [
      0,
      11,
      12,
      15,
      1
    ]
  },
  {
    "cycles": 30183379,
    "type": "band",
    "band": 0,
    "color": 0
  },
  {
    "cycles": 30238628,
    "type": "band",
    "band": 0,
    "color": 11
  },
  {
    "cycles": 30293437,
    "type": "band",
    "band": 0,
    "color": 12
  },
  {
    "cycles": 30350262,
    "type": "band",
    "band": 0,
    "color": 15
  },
  {
    "cycles": 30405278,
    "type": "band",
    "band": 0,
    "color": 1
  },
  {
    "cycles": 30460215,
    "type": "band",
    "band": 1,
    "color": 0
  },
  {
    "cycles": 30515402,
    "type": "band",
    "band": 1,
    "color": 11
  },
  {
    "cycles": 30571977,
    "type": "band",
    "band": 1,
    "color": 12
  },
  {
    "cycles": 30627075,
    "type": "band",
    "band": 1,
    "color": 15
  },
  {
    "cycles": 30682128,
    "type": "band",
    "band": 1,
    "color": 1
  },
  {
    "cycles": 30737041,
    "type": "band",
    "band": 2,
    "color": 0
  },
  {
    "cycles": 30793977,
    "type": "band",
    "band": 2,
    "color": 11
  },
  {
    "cycles": 30848907,
    "type": "band",
    "band": 2,
    "color": 12
  },
  {
    "cycles": 30903983,
    "type": "band",
    "band": 2,
    "color": 15
  },
  {
    "cycles": 30959012,
    "type": "band",
    "band": 2,
    "color": 1
  },
  {
    "cycles": 31015666,
    "type": "band",
    "band": 3,
    "color": 0
  },
  {
    "cycles": 31070295,
    "type": "band",
    "band": 3,
    "color": 11
  },
  {
    "cycles": 31124891,
    "type": "band",
    "band": 3,
    "color": 12
  },
  {
    "cycles": 31179923,
    "type": "band",
    "band": 3,
    "color": 15
  },
  {
    "cycles": 31236835,
    "type": "band",
    "band": 3,
    "color": 1
  },
  {
    "cycles": 31291563,
    "type": "band",
    "band": 4,
    "color": 0
  },
  {
    "cycles": 31346727,
    "type": "band",
    "band": 4,
    "color": 11
  },
  {
    "cycles": 31401609,
    "type": "band",
    "band": 4,
    "color": 12
  },
  {
    "cycles": 31458698,
    "type": "band",
    "band": 4,
    "color": 15
  },
  {
    "cycles": 31513539,
    "type": "band",
    "band": 4,
    "color": 1
  },
  {
    "cycles": 31568446,
    "type": "band",
    "band": 5,
    "color": 0
  },
  {
    "cycles": 31623605,
    "type": "band",
    "band": 5,
    "color": 11
  },
  {
    "cycles": 31680469,
    "type": "band",
    "band": 5,
    "color": 12
  },
  {
    "cycles": 31735401,
    "type": "band",
    "band": 5,
    "color": 15
  },
  {
    "cycles": 31790478,
    "type": "band",
    "band": 5,
    "color": 1
  },
  {
    "cycles": 31845364,
    "type": "band",
    "band": 6,
    "color": 0
  },
  {
    "cycles": 31902531,
    "type": "band",
    "band": 6,
    "color": 11
  },
  {
    "cycles": 31957129,
    "type": "band",
    "band": 6,
    "color": 12
  },
  {
    "cycles": 32012237,
    "type": "band",
    "band": 6,
    "color": 15
  },
  {
    "cycles": 32067295,
    "type": "band",
    "band": 6,
    "color": 1
  },
  {
    "cycles": 32124384,
    "type": "band",
    "band": 7,
    "color": 0
  },
  {
    "cycles": 32179289,
    "type": "band",
    "band": 7,
    "color": 11
  },
  {
    "cycles": 32234116,
    "type": "band",
    "band": 7,
    "color": 12
  },
  {
    "cycles": 32288853,
    "type": "band",
    "band": 7,
    "color": 15
  },
  {
    "cycles": 32345514,
    "type": "band",
    "band": 7,
    "color": 1
  },
  {
    "cycles": 32400034,
    "type": "band",
    "band": 8,
    "color": 0
  },
  {
    "cycles": 32455058,
    "type": "band",
    "band": 8,
    "color": 11
  },
  {
    "cycles": 32509981,
    "type": "band",
    "band": 8,
    "color": 12
  },
  {
    "cycles": 32567104,
    "type": "band",
    "band": 8,
    "color": 15
  },
  {
    "cycles": 32621866,
    "type": "band",
    "band": 8,
    "color": 1
  },
  {
    "cycles": 32676606,
    "type": "band",
    "band": 9,
    "color": 0
  },
  {
    "cycles": 32731097,
    "type": "band",
    "band": 9,
    "color": 11
  },
  {
    "cycles": 32788069,
    "type": "band",
    "band": 9,
    "color": 12
  },
  {
    "cycles": 32842927,
    "type": "band",
    "band": 9,
    "color": 15
  },
  {
    "cycles": 32897848,
    "type": "band",
    "band": 9,
    "color": 1
  },
  {
    "cycles": 32952650,
    "type": "band",
    "band": 10,
    "color": 0
  },
  {
    "cycles": 33009892,
    "type": "band",
    "band": 10,
    "color": 11
  },
  {
    "cycles": 33064647,
    "type": "band",
    "band": 10,
    "color": 12
  },
  {
    "cycles": 33119394,
    "type": "band",
    "band": 10,
    "color": 15
  },
  {
    "cycles": 33174516,
    "type": "band",
    "band": 10,
    "color": 1
  },
  {
    "cycles": 33231397,
    "type": "band",
    "band": 11,
    "color": 0
  },
  {
    "cycles": 33286501,
    "type": "band",
    "band": 11,
    "color": 11
  },
  {
    "cycles": 33341093,
    "type": "band",
    "band": 11,
    "color": 12
  },
  {
    "cycles": 33396103,
    "type": "band",
    "band": 11,
    "color": 15
  },
  {
    "cycles": 33453405,
    "type": "band",
    "band": 11,
    "color": 1
  },
  {
    "cycles": 33507639,
    "type": "phase",
    "phase": "hold"
  },
  {
    "cycles": 37138142,
    "type": "phase",
    "phase": "fade-out",
    "colors": [
      1,
      15,
      12,
      11,
      0
    ]
  },
  {
    "cycles": 37138915,
    "type": "band",
    "band": 0,
    "color": 1
  },
  {
    "cycles": 37194074,
    "type": "band",
    "band": 0,
    "color": 15
  },
  {
    "cycles": 37248967,
    "type": "band",
    "band": 0,
    "color": 12
  },
  {
    "cycles": 37305852,
    "type": "band",
    "band": 0,
    "color": 11
  },
  {
    "cycles": 37360710,
    "type": "band",
    "band": 0,
    "color": 0
  },
  {
    "cycles": 37415209,
    "type": "band",
    "band": 1,
    "color": 1
  },
  {
    "cycles": 37470020,
    "type": "band",
    "band": 1,
    "color": 15
  },
  {
    "cycles": 37526910,
    "type": "band",
    "band": 1,
    "color": 12
  },
  {
    "cycles": 37581622,
    "type": "band",
    "band": 1,
    "color": 11
  },
  {
    "cycles": 37636154,
    "type": "band",
    "band": 1,
    "color": 0
  },
  {
    "cycles": 37690853,
    "type": "band",
    "band": 2,
    "color": 1
  },
  {
    "cycles": 37748120,
    "type": "band",
    "band": 2,
    "color": 15
  },
  {
    "cycles": 37802852,
    "type": "band",
    "band": 2,
    "color": 12
  },
  {
    "cycles": 37857646,
    "type": "band",
    "band": 2,
    "color": 11
  },
  {
    "cycles": 37912870,
    "type": "band",
    "band": 2,
    "color": 0
  },
  {
    "cycles": 37969745,
    "type": "band",
    "band": 3,
    "color": 1
  },
  {
    "cycles": 38024548,
    "type": "band",
    "band": 3,
    "color": 15
  },
  {
    "cycles": 38079519,
    "type": "band",
    "band": 3,
    "color": 12
  },
  {
    "cycles": 38134326,
    "type": "band",
    "band": 3,
    "color": 11
  },
  {
    "cycles": 38191581,
    "type": "band",
    "band": 3,
    "color": 0
  },
  {
    "cycles": 38246193,
    "type": "band",
    "band": 4,
    "color": 1
  },
  {
    "cycles": 38301174,
    "type": "band",
    "band": 4,
    "color": 15
  },
  {
    "cycles": 38356245,
    "type": "band",
    "band": 4,
    "color": 12
  },
  {
    "cycles": 38413447,
    "type": "band",
    "band": 4,
    "color": 11
  },
  {
    "cycles": 38468309,
    "type": "band",
    "band": 4,
    "color": 0
  },
  {
    "cycles": 38523090,
    "type": "band",
    "band": 5,
    "color": 1
  },
  {
    "cycles": 38578246,
    "type": "band",
    "band": 5,
    "color": 15
  },
  {
    "cycles": 38635390,
    "type": "band",
    "band": 5,
    "color": 12
  },
  {
    "cycles": 38690209,
    "type": "band",
    "band": 5,
    "color": 11
  },
  {
    "cycles": 38745270,
    "type": "band",
    "band": 5,
    "color": 0
  },
  {
    "cycles": 38800117,
    "type": "band",
    "band": 6,
    "color": 1
  },
  {
    "cycles": 38857393,
    "type": "band",
    "band": 6,
    "color": 15
  },
  {
    "cycles": 38912087,
    "type": "band",
    "band": 6,
    "color": 12
  },
  {
    "cycles": 38966775,
    "type": "band",
    "band": 6,
    "color": 11
  },
  {
    "cycles": 39021895,
    "type": "band",
    "band": 6,
    "color": 0
  },
  {
    "cycles": 39079007,
    "type": "band",
    "band": 7,
    "color": 1
  },
  {
    "cycles": 39134073,
    "type": "band",
    "band": 7,
    "color": 15
  },
  {
    "cycles": 39188669,
    "type": "band",
    "band": 7,
    "color": 12
  },
  {
    "cycles": 39243544,
    "type": "band",
    "band": 7,
    "color": 11
  },
  {
    "cycles": 39298471,
    "type": "band",
    "band": 7,
    "color": 0
  },
  {
    "cycles": 39351910,
    "type": "band",
    "band": 8,
    "color": 1
  },
  {
    "cycles": 39405352,
    "type": "band",
    "band": 8,
    "color": 15
  },
  {
    "cycles": 39458690,
    "type": "band",
    "band": 8,
    "color": 12
  },
  {
    "cycles": 39511935,
    "type": "band",
    "band": 8,
    "color": 11
  },
  {
    "cycles": 39565360,
    "type": "band",
    "band": 8,
    "color": 0
  },
  {
    "cycles": 39618779,
    "type": "band",
    "band": 9,
    "color": 1
  },
  {
    "cycles": 39673795,
    "type": "band",
    "band": 9,
    "color": 15
  },
  {
    "cycles": 39727267,
    "type": "band",
    "band": 9,
    "color": 12
  },
  {
    "cycles": 39780657,
    "type": "band",
    "band": 9,
    "color": 11
  },
  {
    "cycles": 39834073,
    "type": "band",
    "band": 9,
    "color": 0
  },
  {
    "cycles": 39887374,
    "type": "band",
    "band": 10,
    "color": 1
  },
  {
    "cycles": 39940717,
    "type": "band",
    "band": 10,
    "color": 15
  },
  {
    "cycles": 39995998,
    "type": "band",
    "band": 10,
    "color": 12
  },
  {
    "cycles": 40049512,
    "type": "band",
    "band": 10,
    "color": 11
  },
  {
    "cycles": 40102985,
    "type": "band",
    "band": 10,
    "color": 0
  },
  {
    "cycles": 40156457,
    "type": "band",
    "band": 11,
    "color": 1
  },
  {
    "cycles": 40209890,
    "type": "band",
    "band": 11,
    "color": 15
  },
  {
    "cycles": 40263232,
    "type": "band",
    "band": 11,
    "color": 12
  },
  {
    "cycles": 40316529,
    "type": "band",
    "band": 11,
    "color": 11
  },
  {
    "cycles": 40371575,
    "type": "band",
    "band": 11,
    "color": 0
  },
  {
    "cycles": 40467804,
    "type": "page-end",
    "credit": 3
  }
];
