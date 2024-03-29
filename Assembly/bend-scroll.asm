10 SYS9*4096
12 .CODE 0
14 *=$C000
20 LDA #$00:STA $D020:STA $D021:STA $0286:LDA #$93:JSR $FFD2
22 LDA #239:STA 808:LDA #193:STA 792
100 SETUP SEI:LDA #$7F:STA $DC0D:LDA #$01:STA $D019:STA $D01A
102 LDA #$1B:STA $D011:JSR SETSPR:LDA #<IRQ:LDX #>IRQ:STA $0314:STX $0315
104 LDA #$42:STA $D012:CLI
106 JSR RESET:JEBES JMP JEBES
108 SETSPR LDX #$00:LDA #$18:SSLOOP1 STA $D000,X:PHA:INX:LDA #236:STA $D000,X
110 PLA:CLC:ADC #$30:INX:CPX #$10:BNE SSLOOP1:LDX #$00:LDA #$20
112 SSLOOP2 STA $07F8,X:PHA:LDA #$01:STA $D027,X:PLA:CLC:ADC #$01
114 INX:CPX #$08:BNE SSLOOP2:LDA #$FF:STA $D015:STA $D017:STA $D01D:LDA #$E0
116 STA $D010:LDA #$00:LDX #$00:SSLOOP3 STA $0800,X:STA $0900,X:INX:BNE SSLOOP3
118 RTS
120 IRQ LDA #$01:STA $D019:JSR SPRSCR:JMP RASTER
122 SPRSCR JSR ROLSHIT:INC RTEMP:LDA RTEMP:CMP #24:BNE ENSPR
124 LDA #$00:STA RTEMP:JSR PUT3CHR:ENSPR RTS
126 RTEMP .BYTE $00
128 ROLSHIT LDX #$00:CLC
130 ROLLOOP ROL $09C2,X:ROL $09C1,X
132 ROL $09C0,X:ROL $0982,X:ROL $0981,X
134 ROL $0980,X:ROL $0942,X:ROL $0941,X
136 ROL $0940,X:ROL $0902,X:ROL $0901,X
138 ROL $0900,X:ROL $08C2,X:ROL $08C1,X
140 ROL $08C0,X:ROL $0882,X:ROL $0881,X
142 ROL $0880,X:ROL $0842,X
144 ROL $0841,X:ROL $0840,X
146 ROL $0802,X:ROL $0801,X
148 ROL $0800,X
150 INX:INX:INX:CPX #24:BNE ROLLOOP:RTS
152 PUT3CHR JSR FLIPZ:JSR GCHR:LDX #$00
154 PUT3CHR2 LDA #$00:STA $B1:LDA CHTEMP,X:STA $B0:CLC:ROL $B0:ROL $B1
156 ROL $B0:ROL $B1:ROL $B0:ROL $B1:CLC
158 LDA #$38 ; CHRSET
160 ADC $B1:STA $B1:TXA:PHA:LDY #$00
162 LDX XTEMP:MUCHO1 LDA ($B0),Y:STA $09C0,X:INX:INX:INX:INY
164 CPY #$08:BNE MUCHO1:PLA:TAX:INX:INC XTEMP
166 LDA XTEMP:CMP #$03:BNE PUT3CHR2:LDA #$00:STA XTEMP:JSR FLIPZ:RTS
168 GCHR LDA STEMP0:STA $B0:LDA STEMP1:STA $B1:LDX #$00
170 NEXCHR LDY #$00:LDA ($B0),Y:CMP #$00:BEQ RESET:STA CHTEMP,X:INC $B0
172 BNE NEXCHR2:INC $B1:NEXCHR2 INX:CPX #$03:BNE NEXCHR:LDA $B0:STA STEMP0
174 LDA $B1:STA STEMP1:RTS:RESET LDA #$00:LDX #$28:STA STEMP0:STX STEMP1:RTS
176 FLIPZ LDA $B0:PHA:LDA $B1:PHA:LDA ZTEMP:STA $B0:LDA ZTEMP+1:STA $B1
178 PLA:STA ZTEMP+1:PLA:STA ZTEMP:RTS
180 STEMP0 .BYTE $00:STEMP1 .BYTE $00:CHTEMP .BYTE $00,$00,$00:XTEMP .BYTE $00
182 ZTEMP .BYTE $00,$00
200 RASTER LDA #<ZRQ:LDX #>ZRQ:STA $0314:STX $0315
202 LDA #$1B:STA $D011
204 LDA #$01:STA $D019:STA $D01A
206 LDA #$7F:STA $DC0D
208 LDA #$E2:STA $D012
210 JMP $EA81
212 LTEMP .BYTE $00
214 ZRQ LDA #$01:STA $D019
216 LDA #$E2:STA $D012:LDA DTEMP:NOP:NOP:NOP:STA 53287:STA 53288
218 STA 53289:STA 53290:STA 53291:STA 53292:STA 53293
220 LDA BEND1:STA 53248
222 LDA BEND2:STA 53250
224 LDA BEND3:STA 53252
226 LDA BEND4:STA 53254
228 LDA BEND5:STA 32556
230 LDA BEND6:STA 53258
232 LDA BEND7:STA 53260
236 LDY #$01
238 FLOOP LDA DTEMP,Y:STA 53287:STA 53288:STA 53289:STA 53290:STA 53291
240 STA 53292:STA 53293
242 LDA BEND1,Y:STA 53248
244 LDA BEND2,Y:STA 53250
246 LDA BEND3,Y:STA 53252
248 LDA BEND4,Y:STA 53254
250 LDA BEND5,Y:STA 53256
252 LDA BEND6,Y:STA 53258
254 LDA BEND7,Y:STA 53260
258 NOP
260 INY:CPY #12:BNE FLOOP
262 LDX #$00:JSR TMC:LDA #$00:STA $D020:STA $D021
263 LDA #24:STA 53248:LDA #72:STA 53250:LDA #120:STA 53252:LDA #168:STA 53254
264 LDA #216:STA 53256:LDA #$08:STA 53258:LDA #56:STA 53260:LDA #$01:STA 53287
265 STA 53288:STA 53289:STA 53290:STA 53291:STA 53292:STA 53293
266 INC LTEMP:LDA LTEMP:CMP #$03:BEQ DOIT:JMP RERAS
267 DOIT LDA #$00:STA LTEMP:JSR FLIPEM:JMP RERAS
268 TMC DEX:BPL TMC:NOP:RTS
270 DTEMP .BYTE 2,2,8,7,7,1,1,7,7,8,2,2
272 .BYTE 6,6,$E,3,3,1,1,3,3,$E,6,6
274 .BYTE $B,$B,$C,$F,$F,1,1,$F,$F,$C,$B,$B
276 .BYTE 5,5,3,$D,$D,1,1,$D,$D,3,5,5
278 FLIPEM LDA DTEMP:STA FTEMP
280 LDY #$00
282 ALOOP LDA DTEMP+1,Y:STA DTEMP,Y
284 INY:CPY #48:BNE ALOOP
286 LDA FTEMP:STA DTEMP+47
288 LDA BEND1:STA FTEMP
290 LDY #$00
292 ZLOOP1 LDA BEND1+1,Y:STA BEND1,Y
294 INY:CPY #12:BNE ZLOOP1
296 LDA FTEMP:STA BEND1+11
298 LDA BEND2:STA FTEMP
300 LDY #$00
302 ZLOOP2 LDA BEND2+1,Y:STA BEND2,Y
304 INY:CPY #12:BNE ZLOOP2
306 LDA FTEMP:STA BEND2+11
308 LDA BEND3:STA FTEMP
310 LDY #$00
312 ZLOOP3 LDA BEND3+1,Y:STA BEND3,Y
314 INY:CPY #12:BNE ZLOOP3
316 LDA FTEMP:STA BEND3+11
318 LDA BEND4:STA FTEMP
320 LDY #$00
322 ZLOOP4 LDA BEND4+1,Y:STA BEND4,Y
324 INY:CPY #12:BNE ZLOOP4
326 LDA FTEMP:STA BEND4+11
328 LDA BEND5:STA FTEMP
330 LDY #$00
332 ZLOOP5 LDA BEND5+1,Y:STA BEND5,Y
334 INY:CPY #12:BNE ZLOOP5
336 LDA FTEMP:STA BEND5+11
338 LDA BEND6:STA FTEMP
340 LDY #$00
342 ZLOOP6 LDA BEND6+1,Y:STA BEND6,Y
344 INY:CPY #12:BNE ZLOOP6
346 LDA FTEMP:STA BEND6+11
348 LDA BEND7:STA FTEMP
350 LDY #$00
352 ZLOOP7 LDA BEND7+1,Y:STA BEND7,Y
354 INY:CPY #12:BNE ZLOOP7
356 LDA FTEMP:STA BEND7+11
358 RTS
360 FTEMP .BYTE $00
362 BRK:BEND1 .BYTE 20,21,22,23,24,25,26,25,24,23,22,21:BRK
364 BRK:BEND2 .BYTE 68,69,70,71,72,73,74,73,72,71,70,69:BRK
366 BRK:BEND3 .BYTE 116,117,118,119,120,121,122,121,120,119,118,117:BRK
368 BRK:BEND4 .BYTE 164,165,166,167,168,169,170,169,168,167,166,165:BRK
370 BRK:BEND5 .BYTE 212,213,214,215,216,217,218,217,216,215,214,213:BRK
372 BRK:BEND6 .BYTE 4,5,6,7,8,9,10,9,8,7,6,5:BRK
374 BRK:BEND7 .BYTE 52,53,54,55,56,57,58,57,56,55,54,53:BRK
900 RERAS LDA #$7F:STA $DC0D:LDA #$01:STA $D019:STA $D01A
901 LDA #$1B:STA $D011:LDA #<IRQ:LDX #>IRQ:STA $0314:STX $0315
902 LDA #$42:STA $D012
903 JMP $EA81