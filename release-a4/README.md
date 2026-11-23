# Lexiconcore A4

Bu sürüm lexiconcore.com üzerindeki A3 varlıklarını Cloudflare servis bağlantısı ile kullanır. Değişen modüller ve sayfalar public dizinindedir. Yeni A3 ana sürümlerini bu dosyalarla birleştirerek dağıtın. Site için release-a4 dizininden node build.mjs ve wrangler deploy çalıştırılır. Çevrimiçi üyelik Supabase ile doğrulanır. Ödemeler kapalıdır. Test denemesi kart istemez ve yedi gün sürer.

Özel gelen kutusu ayrı lexiconcore-support Worker’ında çalışır. INBOX özel KV alanı, OWNER_ID sahibinin doğrulanmış Supabase kullanıcı kimliği, AUTH_URL proje adresi, PUBLIC_KEY yayımlanabilir anahtardır. Sıra ile mail.js Worker’ını, tam alıcı adına eşleşen Email Routing kuralını ve site servis bağlantısını kullanın. Gelen iletiler EML olarak en çok 180 gün saklanır. Kutuyu /#/inbox üzerinden yetkili hesap açar. Gelen kutusu SMTP gönderimi içermez.

Android uygulaması Trusted Web Activity kullanır. CI doğrulanmış test APK’sı ve imzasız release AAB üretir. Play için AAB’yi yayıncının yükleme anahtarıyla imzalayın. Play uygulama imzalama sertifikasını Digital Asset Links dosyasına ekleyerek üretim alan adı eşleşmesini tamamlayın. Gizlilik adresi https://lexiconcore.com/gizlilik ve silme adresi https://lexiconcore.com/hesap-silme şeklindedir. Play Console Veri Güvenliği beyanını gerçek mağaza sürümüne göre doldurun.
