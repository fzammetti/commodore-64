10 SYS9*4096
20 .CODE 0
30 *=$C000
32 LDA #$00:STA $D020:STA $D021
39 JSR ZSCROLL:JSR RSCROLL
40 LDA #$93:JSR $FFD2:LDA #$0E:JSR $FFD2
42 SEI:LDA #<IRQ:LDX #>IRQ
50 STA $0314:STX $0315
52 LDA #$1B:STA $D011:LDA #$01:STA $D019:STA $D01A:LDA #$7F:STA $DC0D:CLI:RTS
60 IRQ LDA #$01:STA $D019:LDA #$8A:STA $D012
65 LDA #<IRQ2:LDX #>IRQ2:STA $0314:STX $0315
80 LDA TEMP:STA $D016
90 DEC TEMP:DEC TEMP:LDA TEMP:CMP #$BF:BNE LAMP1
100 LDA #$C7:STA TEMP:JSR MOVE
110 LAMP1 JMP $EA81
130 IRQ2 LDA #$01:STA $D019:LDA #$C2:STA $D012
140 LDA #<IRQZ:LDX #>IRQZ:STA $0314:STX $0315:LDA $B0:STA TA:LDA $B1:STA TB
150 LDA #$C8:STA $D016:JMP IRQZSET
1000 TEMP .BYTE $C7
2000 MOVE LDX #$00
2005 LOOP3 LDA 1425,X:STA 1424,X:INX:CPX #$29:BNE LOOP3
2010 LDY #$00
2020 ME LDA ($B0),Y
2030 CMP #$00:BNE LAMP2
2040 JSR RSCROLL
2050 JMP ME
2060 LAMP2 STA 1424+39:INC $B0:LDA $B0:CMP #$00:BNE ME2:INC $B1:ME2 RTS
3000 RSCROLL LDA #<TEXT1:LDX #>TEXT1:STA $B0:STX $B1:STA TA:STX TB:RTS
3500 TEXT1 .TEXT "HERE IS THE FAST SCROLL! I LIKE THE COLORS! WELL, THAT'S "
3502 .TEXT "IT FOR NOW. I'M OUTTA HERE... SLATE!                          ":BRK
4000 IRQZSET LDA TC:STA $B0:LDA TD:STA $B1
4001 LDA #$1B:STA $D011:LDA #$01:STA $D019:STA $D01A:LDA #$7F:STA $DC0D
4002 JMP $EA81
4010 IRQZ LDA #$01:STA $D019:LDA #$CA:STA $D012
4020 LDA #<IRQS:LDX #>IRQS:STA $0314:STX $0315
4030 LDA ZTEMP:STA $D016
4040 DEC ZTEMP:LDA ZTEMP:CMP #$BF:BNE LAMPZ
4050 LDA #$C7:STA ZTEMP:JSR ZMOVE
4060 LAMPZ JMP $EA81
4070 IRQS LDA #$01:STA $D019:LDA #$82:STA $D012
4080 LDA #<IRQ:LDX #>IRQ:STA $0314:STX $0315:LDA $B0:STA TC:LDA $B1:STA TD
4090 LDA #$C8:STA $D016:JMP IRQRESET
4095 ZTEMP .BYTE $C7
5000 ZSCROLL LDA #<TEXTS:LDX #>TEXTS:STA $B0:STX $B1:STA TC:STX TD:RTS
5002 ZMOVE LDX #$00
5005 LOOPZ LDA 1745,X:STA 1744,X:INX:CPX #$29:BNE LOOPZ
5010 LDY #$00
5020 MEZ LDA ($B0),Y
5030 CMP #$00:BNE LAMPA
5040 JSR ZSCROLL
5050 JMP MEZ
5060 LAMPA STA 1744+39:INC $B0:LDA $B0:CMP #$00:BNE MEK:INC $B1:MEK RTS
5500 TEXTS .TEXT "HERE IS THE SLOWLY CRAWLING SCROLL! IT IS REALLY FAST, I "
5502 .TEXT "THINK. ENJOY THE SCROLL! SLATE!                                ":BRK
6000 IRQRESET LDA #$1B:STA $D011:LDA #$01:STA $D019:STA $D01A:LDA #$7F:STA$DC0D
6020 LDA TA:STA $B0:LDA TB:STA $B1:JMP COLROT
7000 TA .BYTE $00
7001 TB .BYTE $00
7002 TC .BYTE $00
7003 TD .BYTE $00
7100 COLROT LDX#$00:ROT LDA COLS1,X:STA 55296+400,X:LDA COLS2,X:STA 55296+720,X
7200 INX:CPX #$28:BNE ROT
7250 LDA COLS1:STA CTEMP
7251 LDY #$00
7252 ALOP LDA COLS1+1,Y:STA COLS1,Y
7253 INY:CPY #$27:BNE ALOP
7254 LDA CTEMP:STA COLS1+39
7255 LDA COLS2:STA CTEMP
7256 LDY #$00
7257 ALOOP LDA COLS2+1,Y:STA COLS2,Y
7258 INY:CPY #$27:BNE ALOOP
7259 LDA CTEMP:STA COLS2+39:JMP $EA31
7260 CTEMP .BYTE $00
7800 COLS1 .BYTE $0B,$0B,$0B,$0B,$0B,$0C,$0C,$0C,$0C,$0C,$0F,$0F,$0F,$0F,$0F
7802 .BYTE $01,$01,$01,$01,$01,$0F,$0F,$0F,$0F,$0F,$0C,$0C,$0C,$0C,$0C
7803 .BYTE $0B,$0B,$0B,$0B,$0B,$00,$00,$00,$00,$00,$FF
7900 COLS2 .BYTE $02,$02,$02,$02,$02,$0E,$0E,$0E,$0E,$0E,$01,$01,$01,$01,$01
7902 .BYTE $05,$05,$05,$05,$05,$03,$03,$03,$03,$03,$07,$07,$07,$07,$07
7903 .BYTE $08,$08,$08,$08,$08,$0A,$0A,$0A,$0A,$0A,$FF