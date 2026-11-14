/* Würfelflug – die Level. Zeichenerklärung siehe js/level.js.
   Nach jeder Änderung prüfen, ob das Level noch schaffbar ist:
     node tools/solve.js            (schreibt auch die Demo neu) */
(function (WF) {
  'use strict';

  WF.LEVEL_DEFS = [
    {
      id: 'l1',
      name: 'Aufwärmrunde',
      difficulty: 1,
      chunks: [
        // Würfel, normales Tempo: einzelne Stacheln
        [
          '         ^            ^            ^^           '
        ],
        // Treppe aus Blöcken
        [
          '                                            ',
          '                     ######                 ',
          '               ############                 ',
          '    |    ##################       ^^        '
        ],
        // Flug-Portal: als Papierflieger um die Säulen
        [
          '    ##########################################################################################          ',
          '                           #                          #                          #                      ',
          '                           #                          #                          #                      ',
          '                           #                          v                          #                      ',
          '                           v                                                     v                      ',
          '                                                                                                        ',
          '                                        ^                           ^                                   ',
          '                                        #                           #                                   ',
          '                                        #                           #                                   ',
          '   |       P                            #                           #                    C              '
        ],
        // Tempo-Tor: schnell
        [
          '  |  3           ^^             ^^^            ##        ^^       '
        ],
        // Tempo-Tor: langsam
        [
          '                                                    ',
          '   |  1        ^        m        ##       ^         '
        ],
        // Finale, normales Tempo
        [
          '                                                         ',
          '                          ###                            ',
          '   |  2        ^^        #####        ^^        o        '
        ]
      ]
    },
    {
      id: 'l2',
      name: 'Höhenflug',
      difficulty: 2,
      chunks: [
        // Würfel: Block mit Stacheln dahinter, erster Dreier
        [
          '        ^^        ##^^        ^         ###        ^^^      '
        ],
        // Plattformen über einem Stachelbett
        [
          '            ###   ###   ###                   ',
          '   |       ^^^^^^^^^^^^^^^^^        ^^        '
        ],
        // Flug-Slalom: unter der einen Säule durch, über die nächste hinweg
        [
          '  ######################################################################################################',
          '                      #                           #                           #                         ',
          '                      #                           #                           #            O            ',
          '                      #                           #                           v                         ',
          '                      #                           #                                                     ',
          '                      #             ^             #             ^                                       ',
          '                      v             #             v             #                                       ',
          '                                    #                           #             ^                         ',
          '                                    #                           #             #            O            ',
          '   |  P                             #             ^             #             #                         '
        ],
        // Slalom bei hohem Tempo
        [
          '#######################################################################################   ',
          '                      #                                             #                     ',
          '                      #                                             #                     ',
          '                      #                                             #                     ',
          '                      #                               O             #                     ',
          '                      v               ^                             #                     ',
          '                                      #                             v                     ',
          '                                      #                                                   ',
          '                                      #                                                   ',
          '      3               ^               #                                             C     '
        ],
        // Würfel, immer noch schnell
        [
          '                                                                    ',
          '                                  ####                              ',
          '              ^^^           ##########        ^^         ^^^        '
        ],
        // Langsam: unter dem Tunnel nicht springen
        [
          '              #######                               ',
          '              vvvvvvv                               ',
          '                                                    ',
          '   |  1    ^               ^      ##      ^   ^     '
        ],
        // Zweiter Flug: Stacheln oben und unten, Sägen dazwischen
        [
          '  ##################################################################    ',
          '                    vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv               ',
          '                                                                        ',
          '                            O               O                           ',
          '                                                                        ',
          '                                                                        ',
          '                                                                        ',
          '                                    O               O                   ',
          '                                                                        ',
          '   |  2  P          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^       C       '
        ],
        // Finale
        [
          '                                                            ',
          '                         ###                                ',
          '   |        ^^        ######      ^^^        3       ^^     '
        ]
      ]
    },
    {
      id: 'l3',
      name: 'Vollgas',
      difficulty: 3,
      chunks: [
        // Ohne Anlauf: Dreier, Mauer, zwei Dreier im Takt
        [
          '                              ##                               ',
          '        ^^^        ^^#        ##        ^^^      ^^^           '
        ],
        // Sehr schnell: lange Stachelreihen
        [
          '     4            ^^^             ^^^^             ##^^^            ^^^^         '
        ],
        // Flug-Slalom mit engen Toren
        [
          '#########################################################################################################   ',
          '                        #            v            #            v            #                               ',
          '                        #                         #                         #                               ',
          '                        #                         #                         v            O                  ',
          '                        #            ^            #            ^                                            ',
          '                        #            #            #            #                                            ',
          '                        v            #            v            #            ^                               ',
          '                                     #                         #            #            O                  ',
          '                                     #                         #            #                               ',
          '    3   P               ^            #            ^            #            #                        C      '
        ],
        // Langsam und genau: Plattformen über Stacheln
        [
          '                                  ###  ###  ###                 ',
          '   |        1              ^     ^^^^^^^^^^^^^^^       ^        '
        ],
        // Unter den Sägen nicht springen
        [
          '                  O           O           O                   ',
          '                                                              ',
          '   |  2       ^           ^           ^          ^^^          '
        ],
        // Flug bei höchstem Tempo
        [
          '#####################################################################################################   ',
          '                                               #                                 #                      ',
          '                                               #                                 #                      ',
          '                                               #                                 #                      ',
          '                                               #                                 #                      ',
          '                              ^                v                ^                v                      ',
          '                              #                                 #                                       ',
          '                              #                                 #                                       ',
          '                              #                                 #                                       ',
          '    |   4   P                 #                                 #                                C      '
        ],
        // Endspurt: Treppe, Stachelreihen, Ziel
        [
          '                                                                                  ',
          '                                     ####                                         ',
          '   |               ^^^         ##########        ^^^^        ##^^^        ^^^     '
        ]
      ]
    }
  ];
})(globalThis.WF = globalThis.WF || {});
