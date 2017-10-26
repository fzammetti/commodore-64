
// Called when the dialog is shown, this makes calls to the D64Viewer functions and populates
// the screen with the data retrieve from the D64 file.
bool doLoad(HWND hDlg, WPARAM wParam) {
	// Get the file the user wants to open
	TCHAR tchFileName[100] = TEXT("\0");
	OPENFILENAME ofn;
	memset(&ofn, 0, sizeof(ofn));
	ofn.lStructSize = sizeof(OPENFILENAME);
	ofn.hwndOwner = hDlg;
	ofn.lpstrFilter = TEXT("C64 Disk Images\0*.d64\0");
	ofn.nFilterIndex = 0;
	ofn.lpstrFile = tchFileName;
	ofn.nMaxFile = 100;
	ofn.lpstrInitialDir = NULL;
	ofn.lpstrTitle = TEXT("Select the .D64 file to open");
	ofn.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST;
	ofn.lpstrDefExt = TEXT("d64");
	GetOpenFileName(&ofn);
	if (wcscmp(ofn.lpstrFile, L"") == 0) { 
		EndDialog(hDlg, LOWORD(wParam)); 
		return false; 
	} 
	// Actually open and parse it and put the results on the screen
	D64Viewer myD64Viewer;
	TCHAR szOut[10];
	// Read in file
	if (myD64Viewer.readFile(ofn.lpstrFile) != 0) {
		MessageBox(hDlg, L"A problem occurred while reading & parsing D64 file", L"Error", MB_OK);
		return false;
	}
	// Show the disk name
	SetDlgItemText(hDlg, IDC_DISKNAME, myD64Viewer.getDiskName());
	// Show the disk ID
	SetDlgItemText(hDlg, IDC_DISKID,	 myD64Viewer.getDiskID());
	// Show the disk type
	SetDlgItemText(hDlg, IDC_DISKTYPE, myD64Viewer.getDiskTypeDisplay());
	// Show the blocks free on the disk
	swprintf(szOut, L"%d", myD64Viewer.getDiskBlocksFree());
	SetDlgItemText(hDlg, IDC_BLOCKSFREE, szOut);
	// Add each directory item to our list
	HWND hWndLV			 = GetDlgItem(hDlg, IDC_CONTENTS);
	for (unsigned long int i = 0; i < myD64Viewer.getDiskNumberOfDirectoryItems(); i++) {
		TCHAR szOut[10];
		LV_ITEM lvItem;
    lvItem.mask				= LVIF_TEXT | LVIF_PARAM | LVIF_STATE;
	  lvItem.state			= 0;      
	  lvItem.stateMask	= 0;
	  lvItem.iItem			= i; // Index of new item
		lvItem.iSubItem		= 0; // Subitem number of first column (always 0)
		lvItem.pszText		= myD64Viewer.getFileName(i);  // Text for first column
		lvItem.cchTextMax = 32; // Max size of first column
		lvItem.lParam			= NULL;
		ListView_InsertItem(hWndLV, &lvItem);
    // Add each column after the first
		wcscpy(szOut, L"");
		swprintf(szOut, L"%d", myD64Viewer.getFileStartingTrack(i));
		ListView_SetItemText(hWndLV, i, 1, szOut);
		wcscpy(szOut, L"");
		swprintf(szOut, L"%d", myD64Viewer.getFileStartingSector(i));
		ListView_SetItemText(hWndLV, i, 2, szOut);
		wcscpy(szOut, L"");
		swprintf(szOut, L"%d", myD64Viewer.getFileBlocks(i));
		ListView_SetItemText(hWndLV, i, 3, szOut);
		ListView_SetItemText(hWndLV, i, 4, myD64Viewer.getFileTypeDisplay(i));
	}
	return true;
}


LRESULT CALLBACK MainDialog(HWND hDlg, UINT message, WPARAM wParam, LPARAM lParam) {

	SHINITDLGINFO shidi;

	switch (message) {

		case WM_INITDIALOG: {
			// Create a Done button and size it.  
			shidi.dwMask  = SHIDIM_FLAGS;
			shidi.dwFlags = SHIDIF_DONEBUTTON | SHIDIF_SIPDOWN | SHIDIF_SIZEDLGFULLSCREEN;
			shidi.hDlg		= hDlg;
			SHInitDialog(&shidi);
			// Set the font of our list
			LOGFONT logFont;
			logFont.lfHeight				 = 14;
			logFont.lfWidth					 = 0;
			logFont.lfEscapement		 = 0;
			logFont.lfOrientation		 = 0;
			logFont.lfWeight				 = FW_NORMAL;
			logFont.lfItalic				 = false;
			logFont.lfUnderline			 = false;
			logFont.lfStrikeOut			 = false;
			logFont.lfCharSet				 = OEM_CHARSET;
			logFont.lfOutPrecision	 = OUT_DEFAULT_PRECIS;
			logFont.lfClipPrecision  = CLIP_DEFAULT_PRECIS;
			logFont.lfQuality				 = DEFAULT_QUALITY;
			logFont.lfPitchAndFamily = FF_ROMAN | DEFAULT_PITCH;
			wcscpy(logFont.lfFaceName, TEXT("Courier New"));
			SendMessage(GetDlgItem(hDlg, IDC_DISKNAME_LABEL),		WM_SETFONT, (WPARAM)CreateFontIndirect(&logFont), true); 
			SendMessage(GetDlgItem(hDlg, IDC_DISKID_LABEL),			WM_SETFONT, (WPARAM)CreateFontIndirect(&logFont), true); 
			SendMessage(GetDlgItem(hDlg, IDC_DISKTYPE_LABEL),		WM_SETFONT, (WPARAM)CreateFontIndirect(&logFont), true); 
			SendMessage(GetDlgItem(hDlg, IDC_BLOCKSFREE_LABEL), WM_SETFONT, (WPARAM)CreateFontIndirect(&logFont), true); 
			SendMessage(GetDlgItem(hDlg, IDC_DISKNAME),					WM_SETFONT, (WPARAM)CreateFontIndirect(&logFont), true); 
			SendMessage(GetDlgItem(hDlg, IDC_DISKID),						WM_SETFONT, (WPARAM)CreateFontIndirect(&logFont), true); 
			SendMessage(GetDlgItem(hDlg, IDC_DISKTYPE),					WM_SETFONT, (WPARAM)CreateFontIndirect(&logFont), true); 
			SendMessage(GetDlgItem(hDlg, IDC_BLOCKSFREE),				WM_SETFONT, (WPARAM)CreateFontIndirect(&logFont), true); 
			SendMessage(GetDlgItem(hDlg, IDC_CONTENTS),					WM_SETFONT, (WPARAM)CreateFontIndirect(&logFont), true); 
			DeleteObject(CreateFontIndirect(&logFont));
      // Add our columns to our list
			LV_COLUMN	lvColumn;        
      HWND hWndLV			 = GetDlgItem(hDlg, IDC_CONTENTS);
      lvColumn.mask		 = LVCF_FMT | LVCF_WIDTH | LVCF_TEXT | LVCF_SUBITEM;
      lvColumn.fmt		 = LVCFMT_LEFT;
      lvColumn.pszText = L"Filename";
      lvColumn.cx			 = 125;
      ListView_InsertColumn(hWndLV, 0, &lvColumn);
      lvColumn.pszText = L"Track";
      lvColumn.cx			 = 50;
      ListView_InsertColumn(hWndLV, 1, &lvColumn);
      lvColumn.pszText = L"Sector";
      lvColumn.cx			 = 55;
      ListView_InsertColumn(hWndLV, 2, &lvColumn);
      lvColumn.pszText = L"Blocks";
      lvColumn.cx			 = 55;
      ListView_InsertColumn(hWndLV, 3, &lvColumn);
      lvColumn.pszText = L"Type";
      lvColumn.cx			 = 60;
      ListView_InsertColumn(hWndLV, 4, &lvColumn);
			return doLoad(hDlg, wParam);
		break; } 

		case WM_COMMAND: {
			if (LOWORD(wParam) == IDOK) {
				EndDialog(hDlg, LOWORD(wParam));
				return true;
			}
		break; }

	}

  return false;

}
