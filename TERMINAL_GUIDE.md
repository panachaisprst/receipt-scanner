# คู่มือ Terminal: Git และ Vercel

## เปิด Terminal บน Mac

กด Command + Space พิมพ์ `Terminal` แล้วกด Return หรือใน VS Code เลือกเมนู **Terminal → New Terminal** จากนั้นไปยังโฟลเดอร์โปรเจกต์:

```sh
cd "$HOME/Documents/ChatGPT/ComEng"
```

## ตรวจ แก้ และบันทึกโค้ด

```sh
git status
git diff
```

`git status` บอก branch และไฟล์ที่เปลี่ยน ส่วน `git diff` แสดงรายละเอียด จากนั้นทดสอบและเลือกไฟล์ที่ต้องการ (เปลี่ยนชื่อไฟล์ให้ตรงกับงาน):

```sh
npm test --prefix backend
npm run typecheck --prefix backend
npm test --prefix frontend
npm run build --prefix frontend
git add backend/src/app.ts
git diff --cached
git commit -m "Describe the change"
git push
```

`git add` เลือกไฟล์ที่จะบันทึก, `git commit` สร้างจุดบันทึกใน Git บนเครื่อง และ `git push` ส่ง commit ขึ้น branch บน GitHub ตรวจไฟล์ก่อน add เสมอ ไม่เพิ่ม `.env`, keys หรือข้อมูลส่วนตัวลง Git

## Deploy ไป Vercel

โฟลเดอร์นี้เชื่อมกับโปรเจกต์ Vercel แล้ว บนเครื่องที่ล็อกอินไว้ให้รัน:

```sh
npm exec --yes --package vercel -- vercel whoami
npm exec --yes --package vercel -- vercel deploy --prod --yes --scope com-eng-ess
```

`whoami` ตรวจบัญชี Vercel และคำสั่งที่สองสร้าง production deployment ซึ่งเปลี่ยนเว็บไซต์ที่คนอื่นเห็น ควรทดสอบก่อนใช้เสมอ หากยังไม่ได้ล็อกอินให้รัน `npm exec --yes --package vercel -- vercel login` และทำตามข้อความบนหน้าจอ

Vercel project นี้ deploy ผ่าน CLI และยังไม่ได้เชื่อม GitHub repository อัตโนมัติ ดังนั้น `git push` อย่างเดียวไม่ได้อัปเดตเว็บไซต์ โปรดตรวจ URL และทดสอบการเข้าสู่ระบบ/API หลัง deploy ทุกครั้ง
