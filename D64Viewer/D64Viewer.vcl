<html>
<body>
<pre>
<h1>Build Log</h1>
<h3>
--------------------Configuration: D64Viewer - Win32 (WCE x86em) Debug--------------------
</h3>
<h3>Command Lines</h3>
Creating command line "rc.exe /l 0x409 /fo"X86EMDbg/D64Viewer.res" /d UNDER_CE=300 /d _WIN32_WCE=300 /d "UNICODE" /d "_UNICODE" /d "DEBUG" /d "WIN32_PLATFORM_PSPC" /d "_X86_" /d "x86" /d "i486" /r "C:\temp\etc\D64Viewer\D64Viewer.rc"" 
Creating temporary file "C:\WINNT\TEMP\RSPD4C.tmp" with contents
[
/nologo /W3 /Zi /Od /D "DEBUG" /D "i486" /D UNDER_CE=300 /D _WIN32_WCE=300 /D "WIN32" /D "STRICT" /D "_WIN32_WCE_EMULATION" /D "INTERNATIONAL" /D "USA" /D "INTLMSG_CODEPAGE" /D "WIN32_PLATFORM_PSPC" /D "UNICODE" /D "_UNICODE" /D "_X86_" /D "x86" /Fp"X86EMDbg/D64Viewer.pch" /YX /Fo"X86EMDbg/" /Fd"X86EMDbg/" /Gz /c 
"C:\temp\etc\D64Viewer\D64Viewer.cpp"
]
Creating command line "cl.exe @C:\WINNT\TEMP\RSPD4C.tmp" 
Creating temporary file "C:\WINNT\TEMP\RSPD4D.tmp" with contents
[
/nologo /W3 /Zi /Od /D "DEBUG" /D "i486" /D UNDER_CE=300 /D _WIN32_WCE=300 /D "WIN32" /D "STRICT" /D "_WIN32_WCE_EMULATION" /D "INTERNATIONAL" /D "USA" /D "INTLMSG_CODEPAGE" /D "WIN32_PLATFORM_PSPC" /D "UNICODE" /D "_UNICODE" /D "_X86_" /D "x86" /Fp"X86EMDbg/D64Viewer.pch" /Yc"stdafx.h" /Fo"X86EMDbg/" /Fd"X86EMDbg/" /Gz /c 
"C:\temp\etc\D64Viewer\StdAfx.cpp"
]
Creating command line "cl.exe @C:\WINNT\TEMP\RSPD4D.tmp" 
Creating temporary file "C:\WINNT\TEMP\RSPD4E.tmp" with contents
[
commctrl.lib coredll.lib corelibc.lib aygshell.lib /nologo /stack:0x10000,0x1000 /subsystem:windows /incremental:yes /pdb:"X86EMDbg/D64Viewer.pdb" /debug /nodefaultlib:"OLDNAMES.lib" /nodefaultlib:libc.lib /nodefaultlib:libcd.lib /nodefaultlib:libcmt.lib /nodefaultlib:libcmtd.lib /nodefaultlib:msvcrt.lib /nodefaultlib:msvcrtd.lib /nodefaultlib:oldnames.lib /out:"X86EMDbg/D64Viewer.exe" /windowsce:emulation /MACHINE:IX86 
.\X86EMDbg\D64Viewer.obj
.\X86EMDbg\StdAfx.obj
.\X86EMDbg\D64Viewer.res
]
Creating command line "link.exe @C:\WINNT\TEMP\RSPD4E.tmp"
<h3>Output Window</h3>
Compiling resources...
Compiling...
StdAfx.cpp
Compiling...
D64Viewer.cpp
Linking...



<h3>Results</h3>
D64Viewer.exe - 0 error(s), 0 warning(s)
</pre>
</body>
</html>
