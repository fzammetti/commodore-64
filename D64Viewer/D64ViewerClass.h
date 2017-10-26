/* --------------------------------------------------------------------------------------------------

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
 
 You can contact me, Frank W. Zammetti, at frank@zammetti.com or by
 visiting http://www.omnytex.com

 (This code SHOULD run on any platform, If you find anything that keeps it from being
  cross-platform, please let me know, the idea is for it to work on any platform).

 Usage Information:

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
 
 -------------------------------------------------------------------------------------------------- */

class D64Viewer {

	private:

		// Structure that describes a Directory Item
		typedef struct tagDirItemStruct {
			TCHAR						  FileName[20];
			TCHAR							FileTypeDisplay[10];
			unsigned long int FileStartingTrack;
			unsigned long int FileStartingSector;
			unsigned long int FileBlocks;
			unsigned long int FileTypeID;
			bool							FileOpen;
			bool							FileLocked;
		} DirItemStruct;

		// Array of DirItem structures for each file
		DirItemStruct DirItems[150];

		// Disk information members
		TCHAR							 DiskName[20];
		TCHAR							 DiskID[10];
		TCHAR							 DiskTypeDisplay[40];
		unsigned long int  DiskTypeID;
		unsigned long int	 DiskBlocksFree;
		unsigned long int	 DiskNumberOfDirectoryItems;

		// Memory buffer that file is read into
		unsigned char*		MemoryBuffer;

	public:

		// Fields: File Types
		static const unsigned long int ftREL; // Relative
		static const unsigned long int ftUSR; // User
		static const unsigned long int ftPRG; // Program
		static const unsigned long int ftSEQ; // Sequential
		static const unsigned long int ftDEL; // Deleted
		static const unsigned long int ftSCR; // Scratched

		// Fields: Disk Types
		static const unsigned long int dt35;  // 35 Track D64 File (Standard)
		static const unsigned long int dt40;  // 40 Track D64 File
		static const unsigned long int dt35e; // 35 Track D64 File + Error Info

		// Constructor: Allocate our memory buffer
		D64Viewer() {
			MemoryBuffer = (unsigned char*)malloc(180000);
		}

		// Destructor: Deallocate our memory buffer
		~D64Viewer() {
			free(MemoryBuffer);
		}

		// Loads and parses the D64 file
		signed long int readFile(TCHAR* filename) {
			// Clear our memory buffer
			memset(MemoryBuffer, 0, 180000);
			unsigned long int BytesRead; // Total bytes read from file
			// Read the specified file into our memory buffer for parsing
			{
				unsigned long readCount = 0;
				char nfn[50];
				for (unsigned long int i = 0; i < wcslen(filename); i++) {
					nfn[i] = (char) filename[i];
					nfn[i + 1] = '\0';
				}
				FILE *finStream = fopen(&nfn[0], "rb");
				if (finStream == NULL) {
					return -1;
				} else {
					do {
						fread(MemoryBuffer + readCount + 1, sizeof(unsigned char), 1, finStream);
						if (feof(finStream) == 0) { 
							readCount++; 
						}
					} while (feof(finStream) == 0);
					fclose(finStream);
				}
				BytesRead = readCount;
			}

			// Start by clearing out disk information members
			{
				_wcsset(DiskName,        '\0');
				_wcsset(DiskID,          '\0');
				_wcsset(DiskTypeDisplay, '\0');
				DiskTypeID								 = NULL;
				DiskBlocksFree						 = NULL;
				DiskNumberOfDirectoryItems = 0;
			}

			// Clear out all DirItem structs
			{
				for (unsigned long int i = 0; i < 150; i++) {
					_wcsset(DirItems[i].FileName,				 '\0');
					_wcsset(DirItems[i].FileTypeDisplay, '\0');
					DirItems[i].FileStartingTrack	 = NULL;
					DirItems[i].FileStartingSector = NULL;
					DirItems[i].FileBlocks				 = NULL;
					DirItems[i].FileTypeID				 = NULL;
					DirItems[i].FileOpen					 = NULL;
					DirItems[i].FileLocked				 = NULL;
				}
			}

			// Get Disk Name
			{
				unsigned long int z = 91649; // Start of track 18/1
				unsigned long int i;
				unsigned long int j;
				for (i = (z + 0x90 - 256), j = 0; i <= (z + 0x9F - 256); i++, j++) {
					DiskName[j] = *(MemoryBuffer + i);
					DiskName[j + 1] = '\0';
				}
			}

			// Get Disk ID
			{
				unsigned long int z = 91649; // Start of track 18/1
				unsigned long int i;
				unsigned long int j;
				for (i = (z + 0xA2 - 256), j = 0; i <= (z + 0xA6 - 256); i++, j++) {
					DiskID[j] = *(MemoryBuffer + i);
					DiskID[j + 1] = '\0';
				}
			}

			// Get Disk Type
			{
				if (BytesRead == 174848) { 
					DiskTypeID = dt35;
					wcscpy(DiskTypeDisplay, L"35 Track D64 File (Standard)"); 
				}
				if (BytesRead == 196608) { 
					DiskTypeID = dt40;
					wcscpy(DiskTypeDisplay, L"40 Track D64 File");
				}
				if (BytesRead == 175531) { 
					DiskTypeID = dt35e;
					wcscpy(DiskTypeDisplay, L"35 Track D64 File + Error Info");
				}
			}

			// Get Blocks Free
			{
				unsigned long int z = 91397; // First byte of BAM on track 18/0
				unsigned long int totalBlocks = 0;
				unsigned long int i;
 				for (i = 1; i <= 35; i++) {
					// Add up the free blocks, but don't count the directory track
					if (i != 18) {
						totalBlocks = totalBlocks + (unsigned char)*(MemoryBuffer + z);
					}	
					z = z + 4;
				}
 				DiskBlocksFree = totalBlocks;
			}

			// Get directory items
			{
				unsigned long int z							= 91649; // Start of track 18/1
				unsigned long int i							= 0;
				unsigned long int curDirSector	= 1;
				unsigned long int b							= 0;
				unsigned long int t							= 0;
				unsigned long int c							= 0;
				unsigned long int Y							= 0;	
				unsigned long int j							= 0;
				unsigned long int sfilesize1		= 0;
				unsigned long int sfilesize2		= 0;	
				unsigned char			sfiletype			= 0;
				unsigned long int nextDirTrack	= 0;
				unsigned long int nextDirSector = 0;
				// 18 possible directory sectors used
				for (t = 1; t <= 18; t++) {
					Y = 0;
					// GET THE NEXT TRACK/SECTOR OF THE DIRECTORY
					nextDirTrack = *(MemoryBuffer + z);
					nextDirSector = *(MemoryBuffer + z + 1);
					// loop through each directory sector 8 times
					for (c = 0; c <= 7; c++) {
						// GET THE FILENAME
						for (i = (z + 0x5 + Y), j = 0; i <= (z + 0x14 + Y); i++, j++) {
							DirItems[b].FileName[j] = *(MemoryBuffer + i); 
							DirItems[b].FileName[j + 1] = '\0';
						}
						// GET THE STARTING TRACK
						DirItems[b].FileStartingTrack = *(MemoryBuffer + z + 0x3 + Y);
						// GET THE STARTING SECTOR
						DirItems[b].FileStartingSector = *(MemoryBuffer + z + 0x4 + Y);
						// GET THE FILE SIZE (BLOCKS)
						sfilesize1 = *(MemoryBuffer + z + 0x1E + Y);
						sfilesize2 = *(MemoryBuffer + z + 0x1F + Y);
						DirItems[b].FileBlocks = sfilesize1 + (sfilesize2 * 256);
						// GET THE FILE TYPE
						sfiletype = *(MemoryBuffer + z + 0x2 + Y);
						TCHAR tmpFileType[10] = L"???";
						// Convert sfiletype to a string (more precise to check bit states that way)
						char byteStr[] = "00000000";
						char byte = sfiletype;
						for (int ii = 7; ii >= 0; --ii) {
							byteStr[ii] |= byte & 1;
							byte >>= 1;
						}
						// Do the actual type determinations
						if (byteStr[5] == '1' && byteStr[6] == '0' && byteStr[7] == '0') { // Binary pattern -----100
							DirItems[b].FileTypeID = ftREL;
							wcscpy(tmpFileType, L"REL");
						}
						if (byteStr[5] == '0' && byteStr[6] == '1' && byteStr[7] == '1') { // Binary pattern -----011
							DirItems[b].FileTypeID = ftUSR;
							wcscpy(tmpFileType, L"USR");
						}
						if (byteStr[5] == '0' && byteStr[6] == '1' && byteStr[7] == '0') { // Binary pattern -----010
							DirItems[b].FileTypeID = ftPRG;
							wcscpy(tmpFileType, L"PRG");
						}
						if (byteStr[5] == '0' && byteStr[6] == '0' && byteStr[7] == '1') { // Binary pattern -----001
							DirItems[b].FileTypeID = ftSEQ;
							wcscpy(tmpFileType, L"SEQ");
						}
						if (byteStr[5] == '0' && byteStr[6] == '0' && byteStr[7] == '0') { // Binary pattern -----000
							DirItems[b].FileTypeID = ftDEL;
							wcscpy(tmpFileType, L"DEL");
						}
						// Now determine if it's open
						if (byteStr[0] == '0') { // Binary pattern 0-------
							DirItems[b].FileOpen = true;
							wcscat(tmpFileType, L"*");
						}
						// Now determine if it's locked
						if (byteStr[1] == '1') { // Binary pattern -1------
							DirItems[b].FileLocked = true;
							wcscat(tmpFileType, L"<");
						}
						// See it it's scratched.  Must be last or this whole mess won't work!
						if (sfiletype == 0) {
							DirItems[b].FileTypeID = ftSCR;
							wcscpy(tmpFileType, L"SCR");
						}
						wcscpy(DirItems[b].FileTypeDisplay, tmpFileType);
						// SEE IF THIS IS THE LAST FILE OF THE DIRECTORY
						if (DirItems[b].FileStartingTrack == 0 && 
								DirItems[b].FileStartingSector == 0 &&
								sfilesize1 == 0 && 
								sfiletype == 0 && 
								DirItems[b].FileName[0] == 0
								) {
							goto AllDone;
						}   
						Y = Y + 0x20;
						b++;
						DiskNumberOfDirectoryItems = DiskNumberOfDirectoryItems + 1;
					}
					// SEE IF THIS IS THE LAST DIRECTORY SECTOR
					if (nextDirSector == 0 || nextDirTrack == 0) {
						goto AllDone;
					}
					z = z + (256 * (nextDirSector - curDirSector));
					curDirSector = nextDirSector;
				}
			}

			AllDone:
				return 0;

		} // End of LoadFile method

		// Accessor method to get Disk Name
		TCHAR* getDiskName() {
			return DiskName;
		}

		// Accessor method to get Disk ID
		TCHAR* getDiskID() {
			return DiskID;
		}

		// Accessor method to get Disk Type Display
		TCHAR* getDiskTypeDisplay() {
			return DiskTypeDisplay;
		}

		// Accessor method to get Disk Type ID
		unsigned long int getDiskTypeID() {
			return DiskTypeID;
		}

		// Accessor method to get Blocks Free
		unsigned long int getDiskBlocksFree() {
			return DiskBlocksFree;
		}

		// Accessor method to get Number Of DirectoryItems
		unsigned long int getDiskNumberOfDirectoryItems() {
			return DiskNumberOfDirectoryItems;
		}

		// Get the File Name of a specified directory item
		TCHAR* getFileName(unsigned long int index) {
			return DirItems[index].FileName;
		}

		// Get the File Type Display of a specified directory item
		TCHAR* getFileTypeDisplay(unsigned long int index) {
			return DirItems[index].FileTypeDisplay;
		}

		// Get the File Starting Track of a specified directory item
		unsigned long int getFileStartingTrack(unsigned long int index) {
			return DirItems[index].FileStartingTrack;
		}

		// Get the File Starting Sector of a specified directory item
		unsigned long int getFileStartingSector(unsigned long int index) {
			return DirItems[index].FileStartingSector;
		}

		// Get the File Block Size of a specified directory item
		unsigned long int getFileBlocks(unsigned long int index) {
			return DirItems[index].FileBlocks;
		}

		// Get the FileType ID  of a specified directory item
		unsigned long int getFileTypeID(unsigned long int index) {
			return DirItems[index].FileTypeID;
		}

		// Get the File Open Flag of a specified directory item
		bool getFileOpen(unsigned long int index) {
			return DirItems[index].FileOpen;
		}

		// Get the File Locked Flag of a specified directory item
		bool getFileLocked(unsigned long int index) {
			return DirItems[index].FileLocked;
		}

};

// Initialize our static constants (class fields)
const unsigned long int D64Viewer::ftREL = 1;
const unsigned long int D64Viewer::ftUSR = 2;
const unsigned long int D64Viewer::ftPRG = 3;
const unsigned long int D64Viewer::ftSEQ = 4;
const unsigned long int D64Viewer::ftDEL = 5;
const unsigned long int D64Viewer::ftSCR = 6;
const unsigned long int D64Viewer::dt35  = 7;
const unsigned long int D64Viewer::dt40  = 8;
const unsigned long int D64Viewer::dt35e = 9;


