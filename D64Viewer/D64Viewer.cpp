#include "stdafx.h"
#include <commdlg.h>
#include "D64ViewerClass.h"
#include "D64Viewer.h"
#include <commctrl.h>
#include <aygshell.h>
#include <stdio.h>
#include <sipapi.h>
#include "MainDialog.h"

#define MAX_LOADSTRING 100

// Global Variables:
			 HINSTANCE			hInst;		 // The current instance
			 HWND					  hwndCB;		 // The command bar handle
static SHACTIVATEINFO s_sai;

// Forward declarations of functions included in this code module:
ATOM							MyRegisterClass		(HINSTANCE, LPTSTR);
BOOL							InitInstance			(HINSTANCE, int);
LRESULT CALLBACK	WndProc						(HWND, UINT, WPARAM, LPARAM);
LRESULT CALLBACK	MainDialog				(HWND, UINT, WPARAM, LPARAM);
HWND							CreateRpCommandBar(HWND);

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPTSTR lpCmdLine, int nCmdShow) {
	MSG msg;
	HACCEL hAccelTable;
	// Perform application initialization:
	if (!InitInstance (hInstance, nCmdShow)) { return FALSE; }
	hAccelTable = LoadAccelerators(hInstance, (LPCTSTR)IDC_D64VIEWER);
	// Main message loop:
	while (GetMessage(&msg, NULL, 0, 0)) {
		if (!TranslateAccelerator(msg.hwnd, hAccelTable, &msg)) {
			TranslateMessage(&msg);
			DispatchMessage(&msg);
		}
	}
	return msg.wParam;
}

ATOM MyRegisterClass(HINSTANCE hInstance, LPTSTR szWindowClass) {
	WNDCLASS	wc;
    wc.style				 = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc	 = (WNDPROC) WndProc;
    wc.cbClsExtra		 = 0;
    wc.cbWndExtra		 = 0;
    wc.hInstance		 = hInstance;
    wc.hIcon			   = LoadIcon(hInstance, MAKEINTRESOURCE(IDI_D64VIEWER));
    wc.hCursor			 = 0;
    wc.hbrBackground = (HBRUSH) GetStockObject(WHITE_BRUSH);
    wc.lpszMenuName	 = 0;
    wc.lpszClassName = szWindowClass;
	return RegisterClass(&wc);
}

BOOL InitInstance(HINSTANCE hInstance, int nCmdShow) {
	HWND	hWnd = NULL;
	TCHAR	szTitle[MAX_LOADSTRING];			// The title bar text
	TCHAR	szWindowClass[MAX_LOADSTRING];		// The window class name
	hInst = hInstance;		// Store instance handle in our global variable
	// Initialize global strings
	LoadString(hInstance, IDC_D64VIEWER, szWindowClass, MAX_LOADSTRING);
	LoadString(hInstance, IDS_APP_TITLE, szTitle, MAX_LOADSTRING);
	//If it is already running, then focus on the window
	hWnd = FindWindow(szWindowClass, szTitle);	
	if (hWnd) {
		SetForegroundWindow ((HWND) (((DWORD)hWnd) | 0x01));    
		return 0;
	} 
	MyRegisterClass(hInstance, szWindowClass);
	RECT	rect;
	GetClientRect(hWnd, &rect);
	hWnd = CreateWindow(szWindowClass, szTitle, WS_VISIBLE, CW_USEDEFAULT, CW_USEDEFAULT, CW_USEDEFAULT, CW_USEDEFAULT, NULL, NULL, hInstance, NULL);
	if (!hWnd) { return FALSE; }
	//When the main window is created using CW_USEDEFAULT the height of the menubar (if one
	// is created is not taken into account). So we resize the window after creating it
	// if a menubar is present
	{
		RECT rc;
		GetWindowRect(hWnd, &rc);
		rc.bottom -= MENU_HEIGHT;
		if (hwndCB) {
			MoveWindow(hWnd, rc.left, rc.top, rc.right, rc.bottom, FALSE);
		}
	}
	ShowWindow(hWnd, nCmdShow);
	UpdateWindow(hWnd);
	return TRUE;
}

LRESULT CALLBACK WndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam) {
	HDC hdc;
	int wmId, wmEvent;
	PAINTSTRUCT ps;
	TCHAR szHello[MAX_LOADSTRING];
	switch (message) {
		case WM_COMMAND:
			wmId    = LOWORD(wParam); 
			wmEvent = HIWORD(wParam); 
			// Parse the menu selections:
			switch (wmId)	{	
				case IDM_LOAD_FILE:
					DialogBox(hInst, (LPCTSTR)IDD_MAIN_DIALOG, hWnd, (DLGPROC)MainDialog);
				break;
				case IDM_EXIT:
					PostQuitMessage(0);
				break;
				case IDOK:
					SendMessage(hWnd, WM_ACTIVATE, MAKEWPARAM(WA_INACTIVE, 0), (LPARAM)hWnd);
					SendMessage (hWnd, WM_CLOSE, 0, 0);
					break;
				default:
				  return DefWindowProc(hWnd, message, wParam, lParam);
				break;
			}
		break;
		case WM_CREATE:
			hwndCB = CreateRpCommandBar(hWnd);
		break;
		case WM_PAINT:
			RECT rt;
			hdc = BeginPaint(hWnd, &ps);
			GetClientRect(hWnd, &rt);
			LoadString(hInst, IDS_HELLO, szHello, MAX_LOADSTRING);
			DrawText(hdc, szHello, _tcslen(szHello), &rt, DT_SINGLELINE | DT_VCENTER | DT_CENTER);
			EndPaint(hWnd, &ps);
		break; 
		case WM_DESTROY:
			CommandBar_Destroy(hwndCB);
			PostQuitMessage(0);
		break;
		case WM_SETTINGCHANGE:
			SHHandleWMSettingChange(hWnd, wParam, lParam, &s_sai);
    break;
		default:
			return DefWindowProc(hWnd, message, wParam, lParam);
		break;
  }
	return 0;
}

HWND CreateRpCommandBar(HWND hwnd) {
	SHMENUBARINFO mbi;
	memset(&mbi, 0, sizeof(SHMENUBARINFO));
	mbi.cbSize     = sizeof(SHMENUBARINFO);
	mbi.hwndParent = hwnd;
	mbi.nToolBarId = IDM_MENU;
	mbi.hInstRes   = hInst;
	mbi.nBmpId     = 0;
	mbi.cBmpImages = 0;
	if (!SHCreateMenuBar(&mbi)) {	return NULL; }
	return mbi.hwndMB;
}
