10 SYS9*4096
12 .CODE 0
14 *=$C000
18 SEI:LDA #<ME:LDX #>ME:STA $0314:STX $0315:CLI:RTS
22 ME LDX #$00:COLREAD LDA COLT,X:CMP #$FF:BEQ KILL:STA 55296,X:STA 55336,X
23 STA 55376,X:STA 55416,X:STA 55456,X:STA 55496,X:STA 55536,X:STA 55576,X
24 STA 55616,X:STA 55656,X:STA 55696,X:STA 55736,X:STA 55776,X:STA 55816,X
25 STA 55856,X:STA 55896,X:STA 55936,X:STA 55976,X:STA 56016,X:STA 56056,X
26 STA 56096,X:STA 56136,X:STA 56176,X:STA 56216,X:STA 56256,X
27 INX:JMP COLREAD:KILL NOP
28 RUNER JSR FLIPEM
30 LDA #$01:STA TIMERTEMP
31 FUCK LDY #$2F
32 DICK LDX #$2F
34 NIG DEX:CPX #$00:BEQ ASS:JMP NIG
36 ASS CPY #$00:BEQ NEXT:DEY:JMP DICK
38 NEXT LDA TIMERTEMP:CMP #$00:BEQ RETURN:DEC TIMERTEMP:JMP FUCK
40 RETURN JMP $EA31
50 TIMERTEMP .BYTE $00
200 COLT .BYTE $0B,$0B,$0B,$0C,$0C,$0C,$0F,$0F,$0F,$01,$01,$01,$08,$08,$08,$09
202 .BYTE $09,$09,$04,$04,$04,$06,$06,$06,$07,$07,$07,$0E,$0E,$0E,$0D,$0D
204 .BYTE $0D,$0A,$0A,$0A,$03,$03,$03,$00,$FF
3000 FLIPEM LDA COLT:STA FTEMP
3010 LDY #$00
3020 ALOOP LDA COLT+1,Y:STA COLT,Y
3030 INY:CPY #$28:BNE ALOOP
3040 LDA FTEMP:STA COLT+39:RTS
3100 FTEMP .BYTE $00