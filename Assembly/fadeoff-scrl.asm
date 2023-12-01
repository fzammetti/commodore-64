10 SYS9*4096
20 .CODE 0
30 *=$C000
32 LDA #$00:STA $D020:STA $D021:LDA #$0B:STA 646:LDA #$93:JSR $FFD2:LDA #$00
33 STA 646
39 JSR RSCROLL
40 LDA #$0E:JSR $FFD2:LDA #$92:JSR $FFD2
42 SEI:LDA #<IRQ:LDX #>IRQ
50 STA $0314:STX $0315
52 LDA #$1B:STA $D011:LDA #$01:STA $D019:STA $D01A:LDA #$7F:STA $DC0D:CLI:RTS
60 IRQ LDA #$01:STA $D019:LDA #$CA:STA $D012
65 LDA #<IRQ2:LDX #>IRQ2:STA $0314:STX $0315
80 LDA TEMP:STA $D016
82 LDA STAT:CMP #$01:BNE KOPL:LDA DECR:CMP #$00:BEQ RESRT:DEC DECR:JMP LAMP1
84 RESRT LDA #$00:STA STAT:STA DECR:JSR FADE
90 KOPL DEC TEMP
92 DEC TEMP
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
2032 CMP #$00:BNE LAMP2
2040 JSR RSCROLL
2050 JMP ME
2060 LAMP2 STA 1744+39:INC $B0:LDA $B0:CMP #$00:BNE ME2:INC $B1:ME2 RTS
2070 PORT LDA #$01:STA STAT:LDA #$A0:STA DECR
2072 KORT INC $B0:LDA $B0:CMP #$00:BNE MET:INC $B1:MET RTS
2080 STAT .BYTE $00
2082 DECR .BYTE $00
2104 JMP KORT
2110 FADE LDA #$0B:LDX #$00:NEPT1 STA 55296+720,X:INX:CPX #40:BNE NEPT1
2111 LDY #$20:XSET1 LDX #$FF:DECR1 DEX:CPX #$00:BNE DECR1:DEY:CPY #$00:BEQ FNSH1
2112 JMP XSET1:FNSH1 NOP
2120 LDA #$0C:LDX #$00:NEPT2 STA 55296+720,X:INX:CPX #40:BNE NEPT2
2121 LDY #$20:XSET2 LDX #$FF:DECR2 DEX:CPX #$00:BNE DECR2:DEY:CPY #$00:BEQ FNSH2
2122 JMP XSET2:FNSH2 NOP
2130 LDA #$0F:LDX #$00:NEPT3 STA 55296+720,X:INX:CPX #40:BNE NEPT3
2131 LDY #$20:XSET3 LDX #$FF:DECR3 DEX:CPX #$00:BNE DECR3:DEY:CPY #$00:BEQ FNSH3
2132 JMP XSET3:FNSH3 NOP
2140 LDA #$01:LDX #$00:NEPT4 STA 55296+720,X:INX:CPX #40:BNE NEPT4
2141 LDY #$20:XSET4 LDX #$FF:DECR4 DEX:CPX #$00:BNE DECR4:DEY:CPY #$00:BEQ FNSH4
2142 JMP XSET4:FNSH4 NOP
2150 LDA #$0F:LDX #$00:NEPT5 STA 55296+720,X:INX:CPX #40:BNE NEPT5
2151 LDY #$20:XSET5 LDX #$FF:DECR5 DEX:CPX #$00:BNE DECR5:DEY:CPY #$00:BEQ FNSH5
2152 JMP XSET5:FNSH5 NOP
2160 LDA #$0C:LDX #$00:NEPT6 STA 55296+720,X:INX:CPX #40:BNE NEPT6
2161 LDY #$20:XSET6 LDX #$FF:DECR6 DEX:CPX #$00:BNE DECR6:DEY:CPY #$00:BEQ FNSH6
2162 JMP XSET6:FNSH6 NOP
2170 LDA #$0B:LDX #$00:NEPT7 STA 55296+720,X:INX:CPX #40:BNE NEPT7
2171 LDY #$20:XSET7 LDX #$FF:DECR7 DEX:CPX #$00:BNE DECR7:DEY:CPY #$00:BEQ FNSH7
2172 JMP XSET7:FNSH7 NOP
2180 LDA #$00:LDX #$00:NEPT8 STA 55296+720,X:INX:CPX #40:BNE NEPT8
2181 LDY #$20:XSET8 LDX #$FF:DECR8 DEX:CPX #$00:BNE DECR8:DEY:CPY #$00:BEQ FNSH8
2182 JMP XSET8:FNSH8 NOP
2184 LDA #32:LDX #$00:NEPZ STA 1024+720,X:INX:CPX #40:BNE NEPZ
2190 LDA #$0B:LDX #$00:NEPP STA 55296+720,X:INX:CPX #40:BNE NEPP:RTS
3000 RSCROLL LDA #<TEXT:LDX #>TEXT: STA $B0:STX $B1:RTS
4000 TEXT .TEXT "       HERE IS THE NEW SCROLL BY:       _"
4002 .TEXT " FANTASY OF THE NEWAGE CODING CREW  _"
4003 .TEXT "           SEE YA LATER DUDE!           _"
4004 .TEXT "                                                       ":BRK