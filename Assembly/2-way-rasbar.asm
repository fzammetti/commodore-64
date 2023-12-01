10 SYS9*4096
20 .CODE 0
30 SEI:LDA #<IRQ:LDX #>IRQ:STA $0314:STX $0315
40 LDA #$1B:STA $D011
50 LDA #$01:STA $D019:STA $D01A
60 LDA #$7F:STA $DC0D
70 LDA #$6A:STA $D012
80 CLI:RTS
95 LTEMP .BYTE $00
100 IRQ LDA #$01:STA $D019
110 LDA #$6A:STA $D012:LDA DTEMP:NOP:NOP:NOP:NOP:STA $D021
120 NOP:LDX #$01:JSR TMC:LDY #$01
130 FLOOP LDA DTEMP,Y:STA $D021
140 LDX #$05:JSR TMC
150 INY:CPY #$10:BNE FLOOP
160 LDX #$00:JSR TMC:LDA #$00:STA $D020:STA $D021
170 INC LTEMP:LDA LTEMP:CMP #$03:BEQ DOIT:JMP $EA31
180 DOIT LDA #$00:STA LTEMP:JSR FLIPEM:JMP $EA31
1000 TMC DEX:BPL TMC:NOP:RTS
2000 DTEMP .BYTE $00,$0B,$0C,$0F,$01,$0F,$0C,$0B
2005 .BYTE $00,$02,$08,$07,$01,$07,$08,$02
2006 .BYTE $00,$05,$03,$0D,$01,$0D,$03,$05
2008 .BYTE $00,$06,$0E,$03,$01,$03,$0E,$06
2500 DIR .BYTE $00:FTEMP .BYTE $00
2510 TEMP .BYTE $00
3000 FLIPEM LDA DIR:CMP #$01:BEQ DOWN
3001 LDA DTEMP:STA FTEMP:LDY #$00
3002 ALOP1 LDA DTEMP+1,Y:STA DTEMP,Y
3003 INY:CPY #32:BNE ALOP1:LDA FTEMP
3004 STA DTEMP+31:INC TEMP
3005 LDA TEMP:CMP #$20:BEQ RESET:RTS
3006 RESET LDA #$00:STA TEMP:LDA #$01:STA DIR:RTS
3010 DOWN LDA DTEMP+31:STA FTEMP
3011 LDY #30
3012 ALOP2 LDA DTEMP,Y:STA DTEMP+1,Y
3013 DEY:CPY #$FF:BNE ALOP2:LDA FTEMP
3014 STA DTEMP:INC TEMP
3015 LDA TEMP:CMP #$20:BEQ RESEZ:RTS
3016 RESEZ LDA #$00:STA TEMP:STA DIR:RTS