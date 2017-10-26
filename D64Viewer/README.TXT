
 D64Viewer v1.0 - "Portable" class for loading and parsing of a D64 Commodore 64 disk image file

 Copyright (C) 2002  Frank W. Zammetti

 This program is free software; you can redistribute it and/or
 modify it under the terms of the GNU General Public License
 as published by the Free Software Foundation; either version 2
 of the License, or (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public License
 along with this program; if not, write to the Free Software
 Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA  02111-1307, USA.
 
 (Hint: it's in the file "license.txt"!)

 You can contact me, Frank W. Zammetti, at frank@zammetti.com or by
 visiting http://www.omnytex.com


 Introduction
 ------------

 The D64Viewer class is a C++ class that will allow you to load a D64 Commodore 64
 disk image file and parse it's contents.  You will then, through the class's
 accessor methods, have access to information about the disk and access to each
 of the directory items contained in it.

 It should work with any standard 35-track D64 image, as well as 35-track with
 error information and 40-track images as well.

 Included in this archive is an eVC++ project that shows it's usage.  This class
 was originally written for the PocketHobbit project, which was a project
 to port the Frodo C64 emulator to the PocketPC platform.  That's why it's an
 eVC++ project and not something else.

 Also included is a test.d64 image which you can use to test the class out.  The
 image contains all file types in both locked and unlocked states.  The only thing
 it does not contain is open files, so hopefully they work at ALL!

 This code SHOULD run on any platform.  However, it was originally written for
 the PocketPC platform, so I could have done something that will break cross-platform
 compatibiity by accident.  If you find anything that keeps it from being
 cross-platform, please let me know!

 Note that most of this information is contained in the header file, this is just a
 copy of it, with some expansion of the information.


 Usage Information
 -----------------

   To use the D64Viewer class, just included the D64ViewerClass.h file in your
   project and be sure to import <stdio.h> as well, and you should be good to go!
   However, I don't claim to be a C/C++ god by any stretch, so if you find that
   there is something else required, please let me know!


   * FIELDS (PUBLIC STATIC CONST) 

     ftREL : File Type REL
     ftUSR : File Type USR
     ftPRG : File Type PRG
     ftSEQ : File Type SEQ
     ftDEL : File Type DEL
     ftSCR : File Type SCR
     dt35  : Disk Type "35 Track D64 File (Standard)"
     dt40  : Disk Type "40 Track D64 File"
     dt35e : Disk Type "35 Track D64 File + Error Info"

       You can use these fields if you need to do some comparison against the real fields.  For instance,
       if in your code you want to do something different based on disk type, you could do:

       D64Viewer myD64Viewer;
       switch (myD64Viewer.getDiskType()) {
         case (D64Viewer.dt35):
           // Do something
         break;
         case (D64Viewer.dt40):
           // Do something
         break;
       }


   * PUBLIC MEMBERS

     ** Properties
 
        None

     ** Methods

       D64Viewer (Constructor)       : No parameters. No overloaded versions exist
       readFile                      : Parameters: TCHAR*, which is the file to load, including path.  
                                       This method reads in the specified file and parses the 
                                       contents into private members, which are exposed through 
                                       accessor methods. Returns:  0 if everything goes OK, other 
                                       error codes in other cases (only code -1 is currently defined, 
                                       which means something went wrong reading the file, most 
                                       likely it wasn't found)
		   getDiskName                   : No parameters. Returns: TCHAR*, which is the name of the
                                       currently loaded disk.
		   getDiskID                     : No parameters, Returns: TCHAR*, which is the ID of the
                                       currently loaded disk.
		   getDiskTypeDisplay            : No parameters, Returns: TCHAR*, which is a string suitable
                                       for display describing the type of disk currently loaded.
		   getDiskTypeID                 : No parameters, Returns: unsigned long int, which is a
                                       value corresponding to one of the dtxxx fields describing
                                       the type of the currently loaded disk.
		   getDiskBlocksFree             : No parameters, Returns: unsigned long int,which is the
                                       blocks free on the currently loaded disk.
		   getDiskNumberOfDirectoryItems : No parameters, Returns: unsigned long int, which is the
                                       number of directory entries present on the current disk.
		   getFileName                   : Parameters: unsigned long int, which is the directory 
                                       item caller is interested in, Returns: TCHAR*, which is the 
                                       name of the file specified in the call.
		   getFileTypeDisplay            : Parameters: unsigned long int, which is the directory
                                       item caller is interested in.  Returns: TCHAR* which is a
                                       string suitable for display describing the type of the file.
		   getFileStartingTrack          : Parameters: unsigned long int, which is the directory
                                       item caller is interested in.  Returns: unsigned long int,  
                                       which the starting track of the file.
		   getFileStartingSector         : Parameters: unsigned long int, which is the directory
                                       item caller is interested in.  Returns: unsigned long int, 
                                       which is the starting sector of the file.
		   getFileBlocks                 : Parameters: unsigned long int, which is the directory
                                       item caller is interested in.  Returns: unsigned long int, 
                                       which is the block size of the file.
		   getFileTypeID                 : Parameters: unsigned long int, which is the directory
                                       item caller is interested in.  Returns: unsigned long int, 
                                       whichis a value corresponding to one of the ftxxx 
                                       fields describing the type of the file.
		   getFileOpen                   : Parameters: unsigned long int, which is the directory
                                       item caller is interested in.  Returns: bool. which is true
                                       if the file is open, false if not.
		   getFileLocked                 : Parameters: unsigned long int, which is the directory
                                       item caller is interested in.  Returns: bool. which is true
                                       if the file is locked, false if not.


   * Example usage:

     This example shows you how to use the D64Viewer class to load a D64 file and
     access the information about the disk and directory items...

     // Name of file to open
     TCHAR FileName[20] = L"test.d64";
     // Reference our D64Viewer class
     D64Viewer myD64Viewer;
     // Read in file and parse if
     if (myD64Viewer.readFile(FileName) != 0) {
       cout << "Error\n"; // Exit this process after this
     }
     // Show the disk name
     cout << myD64Viewer.getDiskName() << "\n";
     // Show the disk ID
     cout << myD64Viewer.getDiskID() << "\n";
     // Show the disk type
     cout << myD64Viewer.getDiskTypeDisplay() << "\n";
     // Show the blocks free on the disk
     cout << getDiskBlocksFree() << "\n";
     // Display information about each directory item
     for (unsigned long int i = 0; i < myD64Viewer.getDiskNumberOfDirectoryItems(); i++) {
       cout << myD64Viewer.getFileName(i) << "\n";
       cout << myD64Viewer.getFileStartingTrack(i) << "\n";
       cout << myD64Viewer.getFileStartingSector(i) << "\n";
       cout << myD64Viewer.getFileBlocks(i) << "\n";
       cout << myD64Viewer.getFileTypeDisplay(i) << "\n";
     }
 

That's about it!  Pretty simple!  I've also included a D64 file you can test against.  It
has directory entries for every file type in both locked and unlocked states.  The only
thing it doesn't have is open files, so I'm assuming that part of my code works!

Later all!

Frank W. Zammetti
frank@zammetti.com
http://www.omnytex.com