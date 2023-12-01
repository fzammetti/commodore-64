10 SYS9*4096
20 .CODE 0
30 SEI:LDA #<IRQ:LDX #>IRQ:STA $0314:STX $0315
40 LDA #$1B:STA $D011
50 LDA #$01:STA $D019:STA $D01A
60 LDA #$7F:STA $DC0D
70 LDA #$4A:STA $D012
80 CLI:RTS
90 ;
95 LTEMP .BYTE $00
100 IRQ LDA #$01:STA $D019
110 LDA #$4A:STA $D012:LDA DTEMP:NOP:NOP:NOP:STA $D020:STA $D021
120 LDX #$00:JSR TMC:LDY #$01
130 FLOOP LDA DTEMP,Y:STA $D020:STA $D021
140 LDX #$05:JSR TMC
150 INY:CPY #$08:BNE FLOOP
160 LDX #$00:JSR TMC:LDA #$00:STA $D020:STA $D021
170 INC LTEMP:LDA LTEMP:CMP #$03:BEQ DOIT:JMP $EA31
180 DOIT LDA #$00:STA LTEMP:JSR FLIPEM:JMP $EA31
1000 TMC DEX:BPL TMC:NOP:RTS
2000 DTEMP .BYTE $00,$0B,$0C,$0F,$01,$0F,$0C,$0B
2500 ;
3000 FLIPEM LDA DTEMP:STA FTEMP
3010 LDY #$00
3020 ALOOP LDA DTEMP+1,Y:STA DTEMP,Y
3030 INY:CPY #$08:BNE ALOOP
3040 LDA FTEMP:STA DTEMP+7:RTS
3100 FTEMP .BYTE $00