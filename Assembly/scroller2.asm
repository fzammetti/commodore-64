10 SYS9*4096
20 .CODE 0
30 *=$C000
39 JSR RSCROLL
40 LDA #$0E:JSR $FFD2:LDA #$92:JSR $FFD2
42 SEI:LDA #<IRQ:LDX #>IRQ
50 STA $0314:STX $0315
52 LDA #$1B:STA $D011:LDA #$01:STA $D019:STA $D01A:LDA #$7F:STA $DC0D:CLI:RTS
60 IRQ LDA #$01:STA $D019:LDA #$CA:STA $D012
65 LDA #<IRQ2:LDX #>IRQ2:STA $0314:STX $0315
80 LDA TEMP:STA $D016
82 LDA STAT:CMP #$01:BNE KOPL:LDA DECR:CMP #$00:BEQ RESRT:DEC DECR:JMP LAMP1
84 RESRT LDA #$00:STA STAT:STA DECR
90 KOPL LDA SPEED:CMP #$00:BEQ ONCE:DEC TEMP:DEC TEMP:JMP KOYT
92 ONCE DEC TEMP
95 KOYT LDA TEMP:CMP #$BF:BNE LAMP1
100 LDA #$C7:STA TEMP:JSR MOVE
110 LAMP1 JMP $EA81
120 ;
130 IRQ2 LDA #$01:STA $D019:LDA #$C2:STA $D012
140 LDA #<IRQ:LDX #>IRQ:STA $0314:STX $0315
150 LDA #$C8:STA $D016:JMP $EA31
1000 TEMP .BYTE $C7
2000 MOVE LDX #$00
2005 LOOP3 LDA STAT:CMP #$01:BNE FRECK:RTS
2006 FRECK LDA 1745,X:STA 1744,X:INX:CPX #$29:BNE LOOP3
2010 LDY #$00
2020 ME LDA ($B0),Y
2030 CMP #$5F:BEQ PORT
2031 CMP #$5E:BEQ SPESET
2032 CMP #$00:BNE LAMP2
2040 JSR RSCROLL
2050 JMP ME
2060 LAMP2 STA 1744+39:INC $B0:LDA $B0:CMP #$00:BNE ME2:INC $B1:ME2 RTS
2070 PORT LDA #$01:STA STAT:LDA #$A0:STA DECR
2072 KORT INC $B0:LDA $B0:CMP #$00:BNE MET:INC $B1:MET RTS
2080 STAT .BYTE $00
2082 DECR .BYTE $00
2085 SPEED .BYTE $00
2100 SPESET LDA SPEED:CMP #$01:BEQ ZERO:LDA #$01:STA SPEED:JMP KORT
2102 ZERO LDA #$00:STA SPEED
2104 JMP KORT
3000 RSCROLL LDA #<TEXT:LDX #>TEXT: STA $B0:STX $B1:RTS
4000 TEXT .TEXT "      ^HERE IS THE NEW SCROLL BY:       _^"
4002 .TEXT " FANTASY^OF^THE^NEWAGE^CODING^CREW  _"
4003 .TEXT "           SEE YA LATER DUDE!           _^"
4004 .TEXT "          ^               ^                            ":BRK