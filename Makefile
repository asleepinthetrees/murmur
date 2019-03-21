.PHONY: update-dev
update-dev:
	ssh -t ubuntu@youps-dev.csail.mit.edu " \
	cd /home/ubuntu/production/mailx; \
	git pull; \
	sudo lamson restart || sudo lamson start; \
	./youps_reboot.sh \
	" 

.PHONY: start
start:
	docker-compose up --force-recreate --build

.PHONY: stop
stop:
	docker-compose down -v

