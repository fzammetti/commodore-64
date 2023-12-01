10 SYS9*4096
12 .CODE 0
14 *=$C000
20 SETUP SEI:LDA #$7F:STA $DC0D:LDA #$01:STA $D019:STA $D01A
22 LDA #$1B:STA $D011:JSR SETSPR:LDA #<IRQ:LDX #>IRQ:STA $0314:STX $0315
23 LDA #$80:STA $D012:CLI
24 JSR RESET:LDA #$00:STA $D01B:RTS
26 SETSPR LDX #$00:LDA #$18:SSLOOP1 STA $D000,X:PHA:INX:LDA #$C2:STA $D000,X
28 PLA:CLC:ADC #$30:INX:CPX #$10:BNE SSLOOP1:LDX #$00:LDA #$C0
30 SSLOOP2 STA $07F8,X:PHA:LDA #$01:STA $D027,X:PLA:CLC:ADC #$01
32 INX:CPX #$08:BNE SSLOOP2:LDA #$FF:STA $D015:STA $D017:LDA #119:STA $D01D
33 LDA #127:STA $D015:LDA #64
34 STA $D010:LDA #$00:LDX #$00:SSLOOP3 STA $3000,X:STA $3100,X:INX:BNE SSLOOP3
36 LDA #28:STA 53248:LDA #76:STA 53250:LDA #124:STA 53252:LDA #172:STA 53254
37 LDA #196:STA 53256:LDA #244:STA 53258:LDA #36:STA 53260:RTS
38 IRQ LDA #$01:STA $D019:JSR BOUNCE:JSR SPRSCR:JMP $EA31
40 SPRSCR JSR ROLSHIT:INC RTEMP:LDA RTEMP:CMP #24:BNE ENSPR
42 LDA #$00:STA RTEMP:JSR PUT3CHR:ENSPR RTS
44 RTEMP .BYTE $00
46 ROLSHIT LDX #$00:CLC
48 ROLLOOP ROL $31C2,X:ROL $31C1,X
50 ROL $31C0,X:ROL $3182,X:ROL $3181,X
52 ROL $3180,X:ROL $3142,X:ROL $3141,X
54 ROL $3140,X:ROL $3102,X:ROL $3101,X
56 ROL $3100,X:ROL $30C2,X:ROL $30C1,X
58 ROL $30C0,X:ROL $3082,X:ROL $3081,X
60 ROL $3080,X:ROL $3042,X
62 ROL $3041,X:ROL $3040,X
64 ROL $3002,X:ROL $3001,X
66 ROL $3000,X
68 INX:INX:INX:CPX #24:BNE ROLLOOP:RTS
70 PUT3CHR JSR FLIPZ:JSR GCHR:LDX #$00
72 PUT3CHR2 LDA #$00:STA $B1:LDA CHTEMP,X:STA $B0:CLC:ROL $B0:ROL $B1
74 ROL $B0:ROL $B1:ROL $B0:ROL $B1:CLC
76 LDA #$20 ; CHRSET
78 ADC $B1:STA $B1:TXA:PHA:LDY #$00
80 LDX XTEMP:MUCHO1 LDA ($B0),Y:STA $31C0,X:INX:INX:INX:INY
82 CPY #$08:BNE MUCHO1:PLA:TAX:INX:INC XTEMP
84 LDA XTEMP:CMP #$03:BNE PUT3CHR2:LDA #$00:STA XTEMP:JSR FLIPZ:RTS
86 GCHR LDA STEMP0:STA $B0:LDA STEMP1:STA $B1:LDX #$00
88 NEXCHR LDY #$00:LDA ($B0),Y:CMP #$00:BEQ RESET:STA CHTEMP,X:INC $B0
90 BNE NEXCHR2:INC $B1:NEXCHR2 INX:CPX #$03:BNE NEXCHR:LDA $B0:STA STEMP0
92 LDA $B1:STA STEMP1:RTS:RESET LDA #$00:LDX #$28:STA STEMP0:STX STEMP1:RTS
94 FLIPZ LDA $B0:PHA:LDA $B1:PHA:LDA ZTEMP:STA $B0:LDA ZTEMP+1:STA $B1
96 PLA:STA ZTEMP+1:PLA:STA ZTEMP:RTS
97 STEMP0 .BYTE $00:STEMP1 .BYTE $00:CHTEMP .BYTE $00,$00,$00:XTEMP .BYTE $00
98 ZTEMP .BYTE $00,$00
99 TEXT .TEXT "HERE IS THE SPRITE SCROLL IN PAL!                          ":BRK
100 TIME .BYTE $00:BDIR .BYTE $01:BTEMP .BYTE $00
104 BOUNCE LDA TIME:CMP #$02:BEQ KILL:INC TIME:RTS:KILL LDA #$00:STA TIME
105 LDX BTEMP:LDA BDAT,X:NEPT STA $D001:STA $D003:STA $D005:STA $D007
106 STA $D009:STA $D00B:STA $D00D
107 LDA BDIR:CMP #$01:BEQ DOWN:UP DEC BTEMP:LDA BTEMP:CMP #$00:BEQ RESEZ1
108 LDA #$00:STA $D01B:RTS
109 DOWN INC BTEMP:LDA BTEMP:CMP #26:BEQ RESEZ2:LDA #$FF:STA $D01B:RTS
110 RESEZ1 LDA #$01:STA BDIR:LDA #$00:STA $D01B:RTS
112 RESEZ2 LDA #$00:STA BDIR:LDA #$FF:STA $D01B:RTS
200 BDAT .BYTE $C2,$C3,$C4,$C5,$C6,$C7,$C8,$C9,$CA,$CB
201 .BYTE $CC,$CD,$CE,$CF,$D0,$D1,$D2,$D3
202 .BYTE $D4,$D5,$D6,$D7,$D8,$D9,$DA,$DB
203 .BYTE $DC