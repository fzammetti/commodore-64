10 SYS9*4096
20 .CODE 0
30 SEI:LDA #<IRQ:LDX #>IRQ:STA $0314:STX $0315
40 LDA #$1B:STA $D011
50 LDA #$01:STA $D019:STA $D01A
60 LDA #$7F:STA $DC0D
70 LDA #$30:STA $D012
80 CLI:RTS
100 IRQ LDX #$32:LDY #$00
102 MAIN LDA CDAT,Y:LOOP CPX $D012:BNE LOOP
104 STA $D021
105 INX:INY:CPY #$08:BNE MAIN2
106 LDY #$00:MAIN2 CPX #$EC:BNE MAIN
108 LDA #$01:STA $D019:LDA #$00:STA $D020:STA $D021:JSR ROT:JMP $EA31
109 CDAT .BYTE $01,$03,$0E,$06,$06,$0E,$03,$01
110 .BYTE $01,$07,$08,$02,$02,$08,$07,$01
111 .BYTE $01,$0F,$0C,$0B,$0B,$0C,$0F,$01
112 ROT LDA TIME:CMP #$01:BEQ HIGH:INC TIME:RTS:HIGH LDA #$00:STA TIME
113 LDA CDAT:STA FTEMP:LDY #$00
114 ALOOP LDA CDAT+1,Y:STA CDAT,Y:INY
115 CPY #$18:BNE ALOOP:LDA FTEMP
116 STA CDAT+23:RTS:FTEMP .BYTE $00
120 TIME .BYTE $00